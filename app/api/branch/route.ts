// POST /api/branch  — SSE proxy for one parallel future.
// Body: { option: { label, summary }, decision: string }
//
// This is the live-branch engine. It:
//   1. creates a fresh Hermes session,
//   2. emits a synthetic `branch.session` event so the client learns the id,
//   3. opens the upstream chat stream (restricted to the read-only web toolset),
//   4. pipes the upstream SSE bytes straight through to the client.
//
// One of these runs PER OPTION; the client opens N in parallel. The API key
// lives only here on the server.

import { NextRequest } from "next/server";
import { createSession, openChatStream } from "@/lib/hermes";
import type { ForkOption } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Content-Type-Options": "nosniff",
};

function branchPrompt(decision: string, option: ForkOption): string {
  const opt = option.summary
    ? `${option.label} — ${option.summary}`
    : option.label;
  return `You are living out the future in which, faced with this decision:

"${decision}"

...the choice that was made was: ${opt}

Do this, in order:
1. Use the web tool to RESEARCH this path. Run real searches for current facts, tradeoffs, adoption, risks, and what actually happens to people who take it.
2. Reason through the concrete, lived consequences of THIS path specifically — short term and long term, the wins, the costs, the things that bite later.
3. End with a clear verdict for THIS path only: is it a good outcome, and why? Be specific and grounded in what you found. Do not compare to the other options; you only live this one.

Keep it tight and concrete. Cite what you found.`;
}

function sseLine(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

export async function POST(req: NextRequest) {
  let decision: string;
  let option: ForkOption;
  try {
    const body = (await req.json()) as {
      decision?: unknown;
      option?: unknown;
    };
    if (typeof body.decision !== "string" || !body.decision.trim()) {
      return jsonError("Missing 'decision'.", 400);
    }
    const o = body.option as Record<string, unknown> | undefined;
    if (!o || typeof o.label !== "string" || !o.label.trim()) {
      return jsonError("Missing 'option.label'.", 400);
    }
    decision = body.decision.trim();
    option = {
      label: o.label.trim(),
      summary: typeof o.summary === "string" ? o.summary.trim() : "",
    };
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  let sessionId: string;
  try {
    sessionId = await createSession();
  } catch (err) {
    return jsonError(errMessage(err, "Failed to create Hermes session."), 502);
  }

  let upstream: Response;
  try {
    upstream = await openChatStream(sessionId, branchPrompt(decision, option), {
      tools: ["web"],
    });
  } catch (err) {
    return jsonError(errMessage(err, "Failed to open Hermes stream."), 502);
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await safeText(upstream);
    return jsonError(
      `Hermes stream returned ${upstream.status}: ${detail}`,
      502,
    );
  }

  // Compose: first emit our synthetic session event, then forward upstream.
  const upstreamBody = upstream.body;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        sseLine({ type: "branch.session", session_id: sessionId }),
      );
      const reader = upstreamBody.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }
      } catch (err) {
        controller.enqueue(
          sseLine({
            type: "branch.error",
            message: errMessage(err, "Upstream stream error."),
          }),
        );
      } finally {
        controller.close();
      }
    },
    cancel() {
      // Client disconnected: best-effort cancel of upstream.
      void upstreamBody.cancel();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<no body>";
  }
}
