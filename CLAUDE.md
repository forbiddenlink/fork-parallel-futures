# Fork: Parallel Futures

Hermes Agent Challenge submission. Type a hard decision and the app spins up a separate Hermes
agent session per option, each researching and reasoning through that path independently, then
synthesizes a verdict with a confidence score, visualized as a live branching tree.

Hermes has no auto-fork yet (this prototypes the unshipped RFC #31392), so the app orchestrates
the forking itself: it opens N parallel Hermes sessions over the shipped REST + SSE surface and
drives them concurrently, since Hermes drops per-branch subagent events over a single
`delegate_task` call.

## Stack

Next.js 16.3.4 (App Router), React 19.2, TypeScript 7, Tailwind CSS 4. pnpm workspace
(`packageManager: pnpm@10.34.5`, pnpm override pins `postcss` to `>=8.5.23 <9`).

Next.js 16 has breaking changes from training-data-era Next.js. Read the relevant guide in
`node_modules/next/dist/docs/` before writing code against it, and heed deprecation notices.

## Commands

```bash
pnpm install
pnpm dev      # next dev
pnpm build    # next build
pnpm start    # next start
pnpm lint     # eslint
```

## Prerequisites

Node 20+, and a locally-running Hermes Agent with `API_SERVER_ENABLED=1` and `API_SERVER_KEY`
set, reachable over REST (defaults to `http://127.0.0.1:8642`).

## Env vars

Read server-side only, in `app/api/**` route handlers via `lib/hermes.ts`. Never exposed to the
browser.

- `HERMES_API_KEY` - bearer token, sent as `Authorization: Bearer <HERMES_API_KEY>`
- `HERMES_API_URL` - Hermes base URL, defaults to `http://127.0.0.1:8642`

## Architecture

1. `POST /api/decompose` - one Hermes call breaks the decision into 2-3 concrete, mutually
   distinct options, returned as strict JSON.
2. `POST /api/branch` (xN in parallel) - per option, creates a fresh Hermes session and opens
   its chat stream.
3. `POST /api/synthesize` - weighs the parallel futures against each other, recommends a
   winner with a confidence score.

## Layout

- `app/api/{decompose,branch,synthesize}/route.ts` - the three server routes above (dynamic;
  the rest of `app/page.tsx` is static)
- `app/components/` - `DecisionForm`, `ForkTree` (the branching-tree visualization),
  `BranchColumn`, `VerdictCard`, `branch-utils.ts`
- `lib/hermes.ts` - Hermes REST client, reads the env vars above
- `lib/sse-client.ts` - SSE stream consumption from a Hermes session
- `lib/useFork.ts` - client hook orchestrating decompose -> branch -> synthesize
- `lib/types.ts` - shared types

## Conventions

Type via `next/font/google`: Fraunces (display/verdicts), Spectral (body), Space Mono (machine
readouts - research steps, cost tickers, session ids). Motion is restrained (transform/opacity
+ SVG stroke-draw only) and respects `prefers-reduced-motion`. The tree is the hero: a root
node (the decision) fans out via drawn SVG connectors into N branches, converging into a
verdict card with an animated confidence dial.
