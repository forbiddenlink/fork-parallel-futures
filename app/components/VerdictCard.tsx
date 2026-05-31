"use client";

import type { BranchState, SynthesisResult } from "@/lib/types";
import type { ForkPhase } from "@/lib/useFork";
import { branchColorVar } from "./branch-utils";

interface Props {
  phase: ForkPhase;
  synthesis: SynthesisResult | null;
  branches: BranchState[];
}

/**
 * The converged recommendation. Resolves "with weight": a heavy plate showing
 * the winning path, an animated confidence dial, and the one-line why.
 */
export function VerdictCard({ phase, synthesis, branches }: Props) {
  const settled = phase === "complete" && !!synthesis;

  if (!settled) {
    return (
      <div className="anim-rise w-full max-w-2xl bg-vellum-deep/70 px-6 py-5 text-center oracle-rule border">
        <p className="font-readout text-[0.62rem] uppercase tracking-[0.2em] text-ink-faint">
          the oracle
        </p>
        <p className="mt-2 font-display text-lg italic text-ink-soft">
          weighing the futures…
        </p>
      </div>
    );
  }

  const winnerIndex = branches.findIndex(
    (b) => b.option.label === synthesis.winner,
  );
  const accent =
    winnerIndex >= 0 ? branchColorVar(winnerIndex) : "var(--madder)";

  const regrets = synthesis.pathsNotTaken ?? [];

  return (
    <div
      className="anim-settle w-full max-w-2xl bg-vellum px-7 py-6"
      style={{
        border: "1px solid var(--madder)",
        boxShadow: "0 18px 48px -28px rgba(140,59,46,0.6)",
      }}
    >
      <p className="font-readout text-[0.62rem] uppercase tracking-[0.2em] text-madder">
        the oracle recommends
      </p>

      <div className="mt-3 flex items-center justify-between gap-6">
        <div className="min-w-0">
          <h2
            className="font-display text-3xl font-semibold leading-none tracking-tight"
            style={{ color: accent }}
          >
            {synthesis.winner}
          </h2>
          {synthesis.why ? (
            <p className="mt-3 max-w-md font-body text-[0.98rem] leading-relaxed text-ink">
              {synthesis.why}
            </p>
          ) : null}
        </div>
        <ConfidenceDial value={synthesis.confidence} />
      </div>

      {regrets.length > 0 ? (
        <div className="mt-6 border-t border-parchment-edge pt-4">
          <p className="font-readout text-[0.55rem] uppercase tracking-[0.2em] text-ink-faint">
            the path not taken
          </p>
          <ul className="mt-2 space-y-1.5">
            {regrets.map((p) => (
              <li
                key={p.label}
                className="font-body text-[0.86rem] italic leading-relaxed text-ink-faint"
              >
                <span className="text-ink-soft not-italic">{p.label}:</span>{" "}
                {p.regret}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A small radial confidence gauge. The arc fills on mount via a pure CSS
 * keyframe (no React state/effect): we hand the target dash-offset to the
 * `.dial-fill` animation through a custom property, and reduced-motion users
 * get the final value with no sweep (handled in globals.css).
 */
function ConfidenceDial({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const targetOffset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: 88, height: 88 }}>
      <svg width={88} height={88} viewBox="0 0 88 88" aria-hidden>
        <circle
          cx={44}
          cy={44}
          r={radius}
          fill="none"
          stroke="var(--parchment-edge)"
          strokeWidth={6}
        />
        <circle
          cx={44}
          cy={44}
          r={radius}
          fill="none"
          stroke="var(--madder)"
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          transform="rotate(-90 44 44)"
          className="dial-fill"
          style={
            {
              "--dial-from": circumference,
              "--dial-to": targetOffset,
              strokeDashoffset: targetOffset,
            } as React.CSSProperties
          }
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-semibold tabular-nums text-madder">
          {clamped}
        </span>
        <span className="font-readout text-[0.5rem] uppercase tracking-[0.18em] text-ink-faint">
          confidence
        </span>
      </div>
      <span className="sr-only">{clamped} percent confidence</span>
    </div>
  );
}
