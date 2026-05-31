"use client";

import type { ForkState } from "@/lib/useFork";
import { BranchColumn } from "./BranchColumn";
import { VerdictCard } from "./VerdictCard";
import { branchColorVar } from "./branch-utils";

interface Props {
  state: ForkState;
}

/**
 * The live branching tree: a root node (the decision) splitting via drawn SVG
 * connectors into N branch columns that grow in real time, converging into a
 * verdict card once synthesis settles.
 */
export function ForkTree({ state }: Props) {
  const { decision, branches, synthesis, phase } = state;
  const n = branches.length;
  if (n === 0) return null;

  const complete = phase === "complete";
  const winnerLabel = synthesis?.winner ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl">
      {/* Root node — the decision */}
      <div className="flex flex-col items-center">
        <div
          className="anim-rise max-w-2xl bg-vellum px-6 py-4 text-center"
          style={{
            border: "1px solid var(--brass)",
            boxShadow: "0 8px 26px -20px rgba(125,86,24,0.7)",
          }}
        >
          <p className="font-readout text-[0.6rem] uppercase tracking-[0.2em] text-brass-deep">
            the fork
          </p>
          <p className="mt-1 font-display text-lg font-medium italic leading-snug text-ink">
            “{decision}”
          </p>
        </div>

        {/* Connectors: root → each branch head */}
        <BranchConnectors count={n} />
      </div>

      {/* Branch columns */}
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
        }}
      >
        {branches.map((b) => (
          <BranchColumn
            key={b.index}
            branch={b}
            isWinner={complete && b.option.label === winnerLabel}
            complete={complete}
          />
        ))}
      </div>

      {/* Convergence → verdict */}
      {phase === "synthesizing" || complete ? (
        <div className="mt-2 flex flex-col items-center">
          <ConvergeConnectors count={n} settled={complete} />
          <VerdictCard
            phase={phase}
            synthesis={synthesis}
            branches={branches}
          />
        </div>
      ) : null}
    </div>
  );
}

/** SVG fan-out: one root point splitting down into `count` branch heads. */
function BranchConnectors({ count }: { count: number }) {
  const width = 900;
  const height = 56;
  const rootX = width / 2;
  const slot = width / count;
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
      className="block"
    >
      {Array.from({ length: count }).map((_, i) => {
        const targetX = slot * i + slot / 2;
        const d = `M ${rootX} 0 C ${rootX} ${height * 0.6}, ${targetX} ${height * 0.4}, ${targetX} ${height}`;
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={branchColorVar(i)}
            strokeWidth={1.5}
            className="anim-draw"
            style={
              {
                "--draw-len": 140,
                animationDelay: `${120 + i * 90}ms`,
              } as React.CSSProperties
            }
          />
        );
      })}
      <circle cx={rootX} cy={2} r={3.5} fill="var(--brass)" />
    </svg>
  );
}

/** SVG fan-in: `count` branch tails converging back to one verdict point. */
function ConvergeConnectors({
  count,
  settled,
}: {
  count: number;
  settled: boolean;
}) {
  const width = 900;
  const height = 48;
  const verdictX = width / 2;
  const slot = width / count;
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
      className="block"
    >
      {Array.from({ length: count }).map((_, i) => {
        const sourceX = slot * i + slot / 2;
        const d = `M ${sourceX} 0 C ${sourceX} ${height * 0.5}, ${verdictX} ${height * 0.5}, ${verdictX} ${height}`;
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={settled ? "var(--madder)" : branchColorVar(i)}
            strokeWidth={settled ? 1.75 : 1.25}
            strokeOpacity={settled ? 0.9 : 0.5}
            className="anim-draw"
            style={
              {
                "--draw-len": 120,
                animationDelay: `${i * 70}ms`,
              } as React.CSSProperties
            }
          />
        );
      })}
      <circle
        cx={verdictX}
        cy={height - 2}
        r={4}
        fill={settled ? "var(--madder)" : "var(--ink-faint)"}
      />
    </svg>
  );
}
