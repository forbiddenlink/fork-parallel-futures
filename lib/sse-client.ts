"use client";

// Client-side SSE reader. POSTs to a route handler, reads the streaming body,
// and invokes `onEvent` for each parsed `data:` JSON payload. Used by the
// branch orchestration to drive the live tree.
//
// This is plain fetch + ReadableStream (NOT EventSource) because EventSource
// can't issue POST requests with a JSON body.

import type {
  HermesAssistantCompleted,
  HermesAssistantDelta,
  HermesDone,
  HermesMessageStarted,
  HermesRunCompleted,
  HermesRunStarted,
  HermesToolCompleted,
  HermesToolProgress,
  HermesToolStarted,
} from "./types";

/** branch.session: our proxy hands the client the session id it created. */
export interface ProxySessionEvent {
  type: "branch.session";
  session_id?: string;
}

/** branch.error: our proxy surfaced an upstream stream error. */
export interface ProxyErrorEvent {
  type: "branch.error";
  message?: string;
}

/** Any event type we don't model — narrowable away by its `type`. */
export interface UnknownStreamEvent {
  type: "__unknown__";
}

/**
 * A proper discriminated union. We deliberately exclude the open-ended
 * `HermesUnknownEvent` (whose index signature would defeat narrowing); the
 * consumer's switch ignores unmodeled types in its default branch anyway.
 */
export type StreamEvent =
  | ProxySessionEvent
  | ProxyErrorEvent
  | HermesRunStarted
  | HermesMessageStarted
  | HermesAssistantDelta
  | HermesToolStarted
  | HermesToolProgress
  | HermesToolCompleted
  | HermesAssistantCompleted
  | HermesRunCompleted
  | HermesDone
  | UnknownStreamEvent;

export interface ConsumeOptions {
  signal?: AbortSignal;
  onEvent: (event: StreamEvent) => void;
}

/**
 * POST a JSON body to `url` and consume the SSE response, invoking
 * `onEvent` per event. Resolves when the stream ends or `done` is seen.
 */
export async function consumeSseStream(
  url: string,
  body: unknown,
  { signal, onEvent }: ConsumeOptions,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    let detail = `${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) detail = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const rawLine = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        const line = rawLine.replace(/\r$/, "");
        // Hermes frames events with an `event:` line; the `data:` JSON carries
        // no `type`. Our proxy's synthetic events carry their own `type` and no
        // `event:` line. A blank line ends a frame.
        if (line.startsWith("event:")) {
          currentEvent = line.slice("event:".length).trim();
          continue;
        }
        if (line.trim() === "") {
          currentEvent = "";
          continue;
        }
        if (!line.startsWith("data:")) continue;
        const payload = line.slice("data:".length).trim();
        if (!payload || payload === "[DONE]") continue;

        let raw: Record<string, unknown>;
        try {
          raw = JSON.parse(payload) as Record<string, unknown>;
        } catch {
          continue;
        }
        const type =
          currentEvent ||
          (typeof raw.type === "string" ? raw.type : "__unknown__");
        const evt = { ...raw, type } as StreamEvent;
        onEvent(evt);
        if (type === "done") return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
