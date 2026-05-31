"use client";

import { useFork } from "@/lib/useFork";
import { DecisionForm } from "./components/DecisionForm";
import { ForkTree } from "./components/ForkTree";

export default function Home() {
  const { state, run, reset } = useFork();
  const idle = state.phase === "idle";
  const running =
    state.phase === "decomposing" ||
    state.phase === "branching" ||
    state.phase === "synthesizing";

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
        {/* Masthead */}
        <header className="mx-auto mb-10 w-full max-w-2xl">
          <p className="font-readout text-[0.62rem] uppercase tracking-[0.28em] text-brass-deep">
            an oracle instrument
          </p>
          <h1 className="mt-2 font-display text-5xl font-semibold leading-[0.95] tracking-tight text-ink sm:text-6xl">
            Fork
            <span className="font-display text-3xl font-normal italic text-ink-soft">
              {" "}
              : parallel futures
            </span>
          </h1>
          <p className="mt-4 max-w-xl font-body text-[1.02rem] leading-relaxed text-ink-soft">
            Name a hard decision. Fork spins up a separate{" "}
            <span className="italic">Hermes</span> agent for each path, each one
            researches the web, reasons out the consequences, and reports back
            the future it lived. Watch them branch, then read the oracle&rsquo;s
            verdict.
          </p>
        </header>

        {/* Input */}
        <section className="mb-10">
          <DecisionForm
            onSubmit={run}
            disabled={!idle}
            running={running}
            onReset={reset}
          />
        </section>

        {/* Status / error band */}
        {state.phase === "decomposing" ? (
          <p className="anim-rise mx-auto mb-6 max-w-2xl text-center font-readout text-[0.7rem] uppercase tracking-[0.16em] text-ink-faint">
            splitting the decision into distinct futures…
          </p>
        ) : null}
        {state.phase === "error" && state.error ? (
          <div
            className="anim-rise mx-auto mb-6 max-w-2xl bg-vellum-deep px-5 py-4"
            style={{ border: "1px solid var(--madder)" }}
            role="alert"
          >
            <p className="font-readout text-[0.62rem] uppercase tracking-[0.16em] text-madder">
              the instrument jammed
            </p>
            <p className="mt-1 font-body text-[0.95rem] text-ink">
              {state.error}
            </p>
          </div>
        ) : null}

        {/* The live tree */}
        {state.branches.length > 0 ? (
          <section>
            <ForkTree state={state} />
          </section>
        ) : null}
      </main>

      {/* Footer / provenance */}
      <footer className="border-t border-parchment-edge/60 px-5 py-6 sm:px-8">
        <p className="mx-auto max-w-6xl font-readout text-[0.62rem] leading-relaxed tracking-[0.04em] text-ink-faint">
          Prototype for the Hermes Agent Challenge. Each future is a separate
          Hermes agent session orchestrated in parallel, not a single
          delegate_task call, so every branch streams its own research and
          reasoning live. Inspired by Hermes RFC #31392 (&ldquo;auto-forking
          subagents&rdquo;).
        </p>
      </footer>
    </div>
  );
}
