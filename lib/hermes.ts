// Server-side Hermes client helper.
//
// IMPORTANT: this module reads HERMES_API_KEY and must ONLY ever be imported
// from route handlers (server code). The key is never sent to the client.
//
// Verified against the Hermes REST surface:
//   POST /api/sessions                         -> { id }    (create a session)
//   POST /api/sessions/{id}/chat/stream        -> SSE stream of run events
// Model: "hermes-agent". Read-only web toolset is requested so spawned
// children don't block on tool-approval.
//
// This file is imported ONLY from route handlers (app/api/**). The API key is
// read here and never leaves the server. The guard below trips loudly if it is
// ever pulled into a client bundle.

if (typeof window !== "undefined") {
  throw new Error("lib/hermes.ts is server-only and must not run in the browser");
}

const BASE_URL = process.env.HERMES_API_URL ?? "http://127.0.0.1:8642";

/** The model alias the challenge requires. Server default is a cheaper model. */
export const HERMES_MODEL = "hermes-agent";

function requireApiKey(): string {
  const key = process.env.HERMES_API_KEY;
  if (!key) {
    throw new Error(
      "HERMES_API_KEY is not set. Copy .env.local.example to .env.local and add the key.",
    );
  }
  return key;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${requireApiKey()}`,
    "Content-Type": "application/json",
  };
}

export function hermesUrl(path: string): string {
  const base = BASE_URL.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

/**
 * Create a new Hermes session and return its id.
 * The /api/sessions response is expected to carry an `id`; we accept a couple
 * of common key spellings defensively in case the field name differs.
 */
export async function createSession(): Promise<string> {
  const res = await fetch(hermesUrl("/api/sessions"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ model: HERMES_MODEL }),
    // Sessions are short-lived; never cache.
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await safeText(res);
    throw new Error(`createSession failed (${res.status}): ${detail}`);
  }

  const data: unknown = await res.json();
  const id = extractSessionId(data);
  if (!id) {
    throw new Error(
      `createSession returned no session id: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }
  return id;
}

/**
 * Open the SSE chat stream for a session. Returns the raw upstream Response so
 * a route handler can pipe `res.body` straight back to the client.
 *
 * `tools` restricts the child to the read-only web toolset. The Hermes body
 * field name is not 100% pinned, so we send both `tools` and `toolsets` set to
 * ["web"]; the backend ignores whichever it doesn't recognize.
 */
export async function openChatStream(
  sessionId: string,
  message: string,
  options?: { tools?: string[] },
): Promise<Response> {
  const tools = options?.tools ?? ["web"];
  const res = await fetch(
    hermesUrl(`/api/sessions/${encodeURIComponent(sessionId)}/chat/stream`),
    {
      method: "POST",
      headers: {
        ...authHeaders(),
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: HERMES_MODEL,
        message,
        tools,
        toolsets: tools,
        stream: true,
      }),
      cache: "no-store",
    },
  );
  return res;
}

/**
 * Non-streaming convenience call used by decompose + synthesize. We still hit
 * the streaming endpoint (the only chat surface) but accumulate the assistant
 * text server-side and return the final content.
 */
export async function chatOnce(message: string): Promise<string> {
  const sessionId = await createSession();
  // Decompose/synthesize are pure-reasoning steps: no web tool needed, which
  // also keeps them fast and cheap. Pass an empty toolset.
  const res = await openChatStream(sessionId, message, { tools: [] });
  if (!res.ok || !res.body) {
    const detail = await safeText(res);
    throw new Error(`chatOnce stream failed (${res.status}): ${detail}`);
  }
  return await accumulateAssistantText(res.body);
}

/** Drain an SSE body and return the final assistant text. */
async function accumulateAssistantText(
  body: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let delta = "";
  let completed = "";

  // Hermes SSE is named-event framed: the type is on the `event:` line, and the
  // `data:` JSON does NOT carry a `type` field. Track the current event name.
  const handle = (eventName: string, payload: string) => {
    if (!payload || payload === "[DONE]") return;
    let evt: { delta?: string; content?: string };
    try {
      evt = JSON.parse(payload);
    } catch {
      return;
    }
    if (eventName === "assistant.delta" && typeof evt.delta === "string") {
      delta += evt.delta;
    } else if (
      eventName === "assistant.completed" &&
      typeof evt.content === "string"
    ) {
      completed = evt.content;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const rawLine = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      const line = rawLine.replace(/\r$/, "");
      if (line.startsWith("event:")) {
        currentEvent = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        handle(currentEvent, line.slice("data:".length).trim());
      } else if (line.trim() === "") {
        currentEvent = "";
      }
    }
  }

  // Prefer the explicit completed content; fall back to the accumulated delta.
  return (completed || delta).trim();
}

function extractSessionId(data: unknown): string | null {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["id", "session_id", "sessionId"]) {
      const v = obj[key];
      if (typeof v === "string" && v.length > 0) return v;
    }
    // Some APIs nest under `session` or `data`.
    for (const key of ["session", "data"]) {
      const nested = obj[key];
      if (nested) {
        const found = extractSessionId(nested);
        if (found) return found;
      }
    }
  }
  return null;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<no body>";
  }
}
