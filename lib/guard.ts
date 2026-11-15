// Best-effort abuse guard for the three API routes. Each click on "fork it"
// spends the owner's Hermes key (decompose + one stream per option + synthesize),
// so cap the input size and the request rate per client.
//
// State is in process memory: it resets on restart and is not shared between
// serverless instances. It stops a runaway loop or a casual abuser on one
// instance; it is not a spend cap. A real cap needs shared storage.

export const MAX_DECISION_CHARS = 500;
export const RATE_WINDOW_MS = 10 * 60_000;

export interface RateResult {
  ok: boolean;
  retryAfterSeconds: number;
}

export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  now?: () => number;
}) {
  const now = opts.now ?? Date.now;
  const hits = new Map<string, number[]>();
  return {
    check(key: string): RateResult {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((h) => t - h < opts.windowMs);
      if (recent.length >= opts.limit) {
        hits.set(key, recent);
        const wait = Math.ceil((recent[0] + opts.windowMs - t) / 1000);
        return { ok: false, retryAfterSeconds: Math.max(1, wait) };
      }
      recent.push(t);
      hits.set(key, recent);
      // Drop idle keys so the map cannot grow without bound.
      if (hits.size > 5000) {
        for (const [k, v] of hits) {
          if (v.every((h) => t - h >= opts.windowMs)) hits.delete(k);
        }
      }
      return { ok: true, retryAfterSeconds: 0 };
    },
  };
}

/** First address in x-forwarded-for, else one shared bucket. */
export function clientKey(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || "unknown";
}

/** A ready 429 response, or null when the request may proceed. */
export function rateLimited(
  limiter: ReturnType<typeof createRateLimiter>,
  headers: Headers,
): Response | null {
  const r = limiter.check(clientKey(headers));
  if (r.ok) return null;
  return new Response(
    JSON.stringify({ error: "Too many requests. Try again shortly." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(r.retryAfterSeconds),
      },
    },
  );
}

/** A ready 400 response when the decision is over the cap, else null. */
export function decisionTooLong(decision: string): Response | null {
  if (decision.length <= MAX_DECISION_CHARS) return null;
  return new Response(
    JSON.stringify({
      error: `Decision is too long (max ${MAX_DECISION_CHARS} characters).`,
    }),
    { status: 400, headers: { "Content-Type": "application/json" } },
  );
}
