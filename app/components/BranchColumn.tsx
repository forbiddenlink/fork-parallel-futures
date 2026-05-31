"use client";

import { useEffect, useRef } from "react";
import type { BranchState } from "@/lib/types";
import { branchColorVar, formatCost, phaseLabel } from "./branch-utils";

interface Props {
  branch: BranchState;
  isWinner: boolean;
  complete: boolean;
}

export function BranchColumn({ branch, isWinner, complete }: Props) {
  const color = branchColorVar(branch.index);
  const scrollRef = useRef<HTMLDivElement>(null);
  const live = branch.conclusion || branch.reasoning;
  const cost = formatCost(branch.usage);
  const active =
    branch.phase === "researching" || branch.phase === "reasoning";

  // Keep the reasoning pane pinned to the latest text as it streams.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [live]);

  return (
    <article
      className="anim-rise flex w-full flex-col bg-vellum-deep/60"
      style={{
        borderTop: `3px solid ${color}`,
        boxShadow: isWinner
          ? "0 0 0 1px var(--madder), 0 10px 30px -18px rgba(140,59,46,0.55)"
          : "0 6px 22px -20px rgba(33,27,19,0.6)",
        animationDelay: `${branch.index * 90}ms`,
      }}
    >
      {/* Header plate */}
      <header className="border-b border-parchment-edge/70 px-5 pb-3 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3
            className="font-display text-xl font-semibold leading-tight tracking-tight"
            style={{ color }}
          >
            {branch.option.label}
          </h3>
          <span className="font-readout text-[0.62rem] uppercase tracking-[0.14em] text-ink-faint">
            future {branch.index + 1}
          </span>
        </div>
        {branch.option.summary ? (
          <p className="mt-1 font-body text-[0.92rem] italic leading-snug text-ink-soft">
            {branch.option.summary}
          </p>
        ) : null}

        <div className="mt-3 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 font-readout text-[0.66rem] uppercase tracking-[0.12em] text-ink-faint">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                active ? "anim-pulse" : ""
              }`}
              style={{
                backgroundColor:
                  branch.phase === "error" ? "var(--madder)" : color,
              }}
            />
            {phaseLabel(branch.phase)}
          </span>
          <span
            className="font-readout text-[0.66rem] tabular-nums text-ink-faint"
            title="per-branch usage"
          >
            {cost ?? "—"}
          </span>
        </div>
      </header>

      {/* Research log */}
      <section className="px-5 py-3">
        <h4 className="font-readout text-[0.6rem] uppercase tracking-[0.18em] text-ink-faint">
          Research
        </h4>
        {branch.research.length === 0 ? (
          <p className="mt-1 font-body text-[0.85rem] italic text-ink-faint">
            {branch.phase === "spawning"
              ? "opening session…"
              : "no web steps yet"}
          </p>
        ) : (
          <ol className="mt-1.5 space-y-1.5">
            {branch.research.map((step) => (
              <li
                key={step.id}
                className="flex items-start gap-2 font-readout text-[0.72rem] leading-snug"
              >
                <span
                  aria-hidden
                  className={`mt-[3px] inline-block h-1.5 w-1.5 shrink-0 ${
                    step.status === "running" ? "anim-pulse" : ""
                  }`}
                  style={{
                    backgroundColor:
                      step.status === "done" ? color : "transparent",
                    border: `1px solid ${color}`,
                    borderRadius: "1px",
                  }}
                />
                <span className="text-ink-soft">
                  <span className="text-ink-faint">{step.toolName}</span>
                  {step.preview ? (
                    <span className="text-ink-soft"> · {step.preview}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Live reasoning */}
      <div
        ref={scrollRef}
        className="thin-scroll mx-5 mb-4 max-h-72 min-h-24 overflow-y-auto border-t border-parchment-edge/50 pt-3 font-body text-[0.92rem] leading-relaxed text-ink"
      >
        {live ? (
          <p className="whitespace-pre-wrap">{live}</p>
        ) : (
          <p className="italic text-ink-faint">
            {branch.error
              ? branch.error
              : active
                ? "living this future…"
                : "awaiting transmission…"}
          </p>
        )}
      </div>

      {/* Verdict ribbon when complete */}
      {complete && branch.phase !== "error" ? (
        <footer
          className="mt-auto px-5 py-2.5 font-readout text-[0.62rem] uppercase tracking-[0.16em]"
          style={{
            backgroundColor: isWinner ? "var(--madder)" : "transparent",
            color: isWinner ? "var(--vellum)" : "var(--ink-faint)",
            borderTop: `1px solid ${isWinner ? "var(--madder)" : "var(--parchment-edge)"}`,
          }}
        >
          {isWinner ? "★ recommended path" : "path settled"}
        </footer>
      ) : null}
    </article>
  );
}
