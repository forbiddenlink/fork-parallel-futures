# Fork: Parallel Futures

![Fork demo](public/fork-demo.gif)

A submission for the **Hermes Agent Challenge**.

Type a hard decision (_"Rust or Go next?"_, _"take job A or B?"_) and Fork
spins up a **separate Hermes agent for each path**. Each agent autonomously
**researches the web**, reasons through the concrete consequences of living out
_that_ future, and reports back its verdict. A final synthesis step weighs the
parallel futures against each other and recommends a winner with a confidence
score. The whole thing is visualized as a **live branching tree** that grows in
real time.

The framing is deliberate: this is not a debate panel. Each branch is one
**lived-out future**, explored independently, then converged.

## The idea: prototyping RFC #31392

This app is a working prototype of the (unshipped) Hermes **RFC #31392,
"auto-forking subagents."** That RFC imagines an agent that, faced with a
branching decision, automatically forks itself into parallel subagents (one per
branch), each exploring its branch end to end, then reconciles them.

Hermes can't auto-fork yet, so **Fork orchestrates the forking from the
outside**: the Next.js app itself opens N parallel Hermes sessions and drives
them concurrently. The result is the RFC #31392 experience today, built on top
of the shipped REST + SSE surface.

## Architecture (and why it's built this way)

The naive approach, a single `delegate_task` call asking one agent to explore
every branch, does **not** work for this UX. Hermes drops its per-branch
subagent events over REST, so you'd get one opaque tool call with **no live
branches** to render. So the app orchestrates N independent sessions itself:

1. **Decompose** (`POST /api/decompose`): one Hermes call breaks the decision
   into 2-3 concrete, mutually-distinct options, returned as strict JSON.
2. **Branches** (`POST /api/branch`, ×N in parallel): per option, the server
   creates a fresh session (`POST /api/sessions`) and opens its chat stream
   (`POST /api/sessions/{id}/chat/stream`), restricted to the **read-only web
   toolset** so children don't hang on tool approval. Each branch is told it is
   _living the future_ where that choice was made: research it, reason through
   the consequences, deliver a verdict for that path. The route is an **SSE
   proxy** that streams the raw upstream events straight through to the browser.
3. **Synthesize** (`POST /api/synthesize`): one Hermes call takes the N branch
   conclusions and returns `{ winner, confidence (0-100), why }`.

The browser consumes the proxied SSE and drives the live tree from these events:
`run.started`, `message.started`, `assistant.delta` (accumulates into a branch's
reasoning), `tool.started` / `tool.completed` (rendered as research steps),
`tool.progress`, `assistant.completed`, `run.completed` (per-branch cost),
`done`.

### Files

| File | Role |
| --- | --- |
| `lib/hermes.ts` | Server-only Hermes client (holds the API key + base URL; `createSession`, `openChatStream`, `chatOnce`). |
| `lib/types.ts` | Shared types + the typed Hermes SSE event envelope. |
| `lib/sse-client.ts` | Client-side SSE reader (fetch + `ReadableStream`, not `EventSource`, so it can POST a JSON body). |
| `lib/useFork.ts` | Orchestration hook: decompose → N parallel branches → synthesize, as a reducer-driven state machine. |
| `app/api/decompose/route.ts` | Decompose call + robust JSON extraction. |
| `app/api/branch/route.ts` | Per-branch SSE proxy (creates session, pipes the stream). |
| `app/api/synthesize/route.ts` | Synthesis call + recommendation parsing. |
| `app/page.tsx` + `app/components/*` | The oracle UI: decision input, live branching tree, verdict card. |

### Security

The Hermes API key is read **only** in server-side route handlers via
`lib/hermes.ts` and sent as `Authorization: Bearer <key>`. It is never bundled
into client code. (`lib/hermes.ts` also trips a runtime guard if it is ever
imported in the browser.)

## Design

An **oracle / cartographic instrument**, not a dashboard. Warm vellum paper,
deep ink, antique brass, with **madder red reserved for the winning verdict**
and a muted slate-teal for branches in motion. No neon-on-dark, no
glassmorphism, no gradient text.

- **Type** (via `next/font/google`): **Fraunces** (high-contrast old-style
  serif, optical sizing) for display + verdicts; **Spectral** for body reading
  text; **Space Mono** for machine readouts (research steps, cost tickers,
  session ids).
- **The tree is the hero**: a root node (the decision) fans out via drawn SVG
  connectors into N branches that grow as they stream, then converges back into
  a verdict card that resolves with weight, complete with an animated confidence
  dial.
- **Motion** is restrained (transform/opacity + SVG stroke draw only) and fully
  respects `prefers-reduced-motion`.

## Prerequisites

- **Node 20+**
- **pnpm**
- A locally-running **Hermes Agent** with `API_SERVER_ENABLED=1` and
  `API_SERVER_KEY` set. The app talks to it over REST, so the agent's API server
  must be reachable (defaults to `http://127.0.0.1:8642`).

## Getting started

```bash
cp .env.local.example .env.local
# then edit .env.local and set HERMES_API_KEY (and HERMES_API_URL if not local)

pnpm install   # already installed in this scaffold
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), type a decision, and watch
the futures branch.

### Environment

| Var | Purpose |
| --- | --- |
| `HERMES_API_KEY` | Bearer token. **Server-side only.** |
| `HERMES_API_URL` | Hermes base URL. Defaults to `http://127.0.0.1:8642`. |

## Build

```bash
pnpm build
```

Produces a clean production build; the three `/api/*` routes are server-rendered
dynamic functions, the page is static.

## License

MIT. See [LICENSE](LICENSE).
