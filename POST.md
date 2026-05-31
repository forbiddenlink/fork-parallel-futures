---
title: "Fork: I made an AI live out both sides of a hard decision, in parallel"
tags: hermesagentchallenge, devchallenge, agents
cover_image: cover.png
---

*This is a submission for the Hermes Agent Challenge.*

*(Demo video below.)*

## What I built

**Fork** takes a hard decision and spins up a separate Hermes agent for each option. Every agent goes and *lives out* its path: it researches the real web, reasons through the concrete consequences, and reports back the future it lived. You watch the branches grow side by side in real time, then a final agent weighs them and returns a recommendation with a confidence score.

Ask it "Learn Rust or Go next?" and you do not get one hedged answer. You get two agents, one per path, each running real searches ("Rust borrow checker problems", "Go adoption cloud infrastructure", real URLs pulled and read) and writing an honest verdict for the life it lived. Then the oracle picks: **Rust, 78% confidence**, with the reasoning that sold it.

It is built as a calm, cartographic instrument on warm paper, not another dark dashboard. The point is to make a branching decision feel like something you can watch happen.

## Demo

- Type a decision (or pick a preset).
- Watch it split into 2 to 3 distinct options.
- Each option becomes its own column: live research steps, streaming reasoning, a verdict for that path.
- The synthesis card resolves last: the winning path, a confidence dial, and why.

## How it works

Three steps, all driven by the Hermes Agent REST API running locally:

1. **Decompose.** One Hermes call breaks the decision into 2 to 3 genuinely different options, returned as strict JSON.
2. **Branch (the interesting part).** For each option, the app opens a *separate* Hermes session and streams a chat run. Each run is told: "you are living the future where this was the choice; research it with the web tool, reason through the consequences, give a verdict for this path only." The runs happen in parallel. The browser reads each one's Server-Sent Events and grows that branch live.
3. **Synthesize.** A final call reads all the branch verdicts and returns a winner plus a confidence percentage plus the one-line why.

### Why separate sessions instead of one `delegate_task`

My first instinct was to use Hermes' built-in `delegate_task` to fan out subagents from a single run. I read the source before committing, and found the catch: `delegate_task` emits rich per-child events (`subagent.start`, `subagent.thinking`, `subagent.tool`) but those are consumed by the terminal UI and are *intentionally not forwarded* over the REST API. Over HTTP, a delegated fan-out collapses into one opaque tool call with no visible branches.

So the orchestration lives in the app: N independent sessions, each fully observable. The upside is that every branch streams its own `assistant.delta` reasoning and `tool.started` research steps, with its own token cost, which is exactly what makes the live tree possible.

Worth heading off the obvious follow-up: Hermes' REST API does expose a native `POST /api/sessions/{id}/fork` endpoint that tracks session lineage through SessionDB, mirroring the CLI's `/branch`. Fork does not use it. Native fork creates branched lineage and history, not N independently-observable concurrent live streams. To render a live tree where every branch shows its own research and reasoning as it happens, you need N separate sessions streaming in parallel. Same reason `delegate_task` does not work here: a forked-but-shared transport gives you one resumable history, not many simultaneous observable runs.

### The bug worth sharing

Hermes frames its SSE as *named events*: the type is on the `event:` line, and the `data:` JSON has no `type` field.

```
event: assistant.delta
data: {"delta": "...", "session_id": "...", "seq": 3}
```

If you parse only `data:` and switch on `data.type` (the obvious thing, and what I did first), you capture nothing and every branch renders empty. The fix is to track the current `event:` line and use that as the discriminator. Easy once you see a raw stream, invisible until you do.

## How I used Hermes Agent

Fork leans on Hermes for the parts that are actually hard:

- **Parallel agent sessions** via the OpenAI-compatible REST server (`/api/sessions`, `/api/sessions/{id}/chat/stream`). Each future is a real, isolated agent run.
- **The web tool**, so each branch researches real, current facts. I watched a single branch fire five concurrent `web_search` calls and then `web_extract` two articles before reasoning. The branches are grounded, not hallucinated. That is the line between this and an opinion panel.
- **Streaming run events**, which give per-branch live reasoning, research steps, and token usage for the cost readout.
- A cheap model (Claude Haiku via Nous Portal) as the default, so a four-call decision run costs cents.

## Why I built this

Hermes maintainers have an open RFC (#31392, "auto-forking subagents") for letting an agent fork itself down parallel paths. It is not shipped. Fork is a prototype of that idea from the outside: instead of one agent forking internally, the app forks the agent into parallel lived futures and shows you all of them at once. Decisions are the one place where "what would actually happen if I did this" is worth paying for, and an agent that can research is well suited to answering it per-path.

## Honest notes

- Concurrency is capped at a few branches (Hermes' subagent cap is 3; I keep the UI in that range).
- Each branch reads from the open web, so in principle a page could try to influence the agent. For a decision-explorer that is low stakes, but it is a real property of any agent that browses, worth naming rather than hiding.
- The verdict is a recommendation from research, not financial or life advice. It shows its work so you can disagree.

## Try it

Repo: https://github.com/forbiddenlink/fork-parallel-futures

```
# Hermes Agent running locally with API_SERVER_ENABLED + API_SERVER_KEY
cp .env.local.example .env.local   # set HERMES_API_KEY + HERMES_API_URL
pnpm install && pnpm dev
```

Built with Next.js, the Hermes Agent REST API, Fraunces + Spectral + Space Mono, and a lot of watching futures branch.
