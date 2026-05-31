// Small pure helpers shared across branch UI components.

import type { BranchPhase, BranchUsage } from "@/lib/types";

/** CSS custom-property color for a branch by its index (rotates through 3). */
export function branchColorVar(index: number): string {
  return `var(--branch-${index % 3})`;
}

/** Human label for a branch lifecycle phase. */
export function phaseLabel(phase: BranchPhase): string {
  switch (phase) {
    case "idle":
      return "waiting";
    case "spawning":
      return "spawning session";
    case "researching":
      return "researching";
    case "reasoning":
      return "reasoning";
    case "done":
      return "settled";
    case "error":
      return "error";
    default:
      return phase;
  }
}

/**
 * Format a branch's cost for the ticker. Prefer an explicit USD cost; otherwise
 * show token totals. Returns null if we have nothing to show yet.
 */
export function formatCost(usage: BranchUsage | null): string | null {
  if (!usage) return null;
  if (typeof usage.costUsd === "number") {
    return `$${usage.costUsd.toFixed(4)}`;
  }
  if (typeof usage.totalTokens === "number") {
    return `${usage.totalTokens.toLocaleString()} tok`;
  }
  const i = usage.inputTokens ?? 0;
  const o = usage.outputTokens ?? 0;
  if (i || o) return `${(i + o).toLocaleString()} tok`;
  return null;
}
