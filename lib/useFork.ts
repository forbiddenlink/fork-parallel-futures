"use client";

// Orchestration hook for Fork — Parallel Futures.
//
// The whole choreography lives here:
//   1. POST /api/decompose         -> options
//   2. for each option, POST /api/branch (SSE) in PARALLEL, streaming each
//      branch's reasoning + research steps + cost into BranchState
//   3. once all branches settle, POST /api/synthesize -> winner + confidence
//
// The component just renders the returned state; it owns no fetch logic.

import { useCallback, useReducer, useRef } from "react";
import { consumeSseStream } from "./sse-client";
import type {
  BranchState,
  BranchUsage,
  DecomposeResult,
  ForkOption,
  ResearchStep,
  SynthesisResult,
} from "./types";

export type ForkPhase =
  | "idle"
  | "decomposing"
  | "branching"
  | "synthesizing"
  | "complete"
  | "error";

export interface ForkState {
  phase: ForkPhase;
  decision: string;
  branches: BranchState[];
  synthesis: SynthesisResult | null;
  error: string | null;
}

const initialState: ForkState = {
  phase: "idle",
  decision: "",
  branches: [],
  synthesis: null,
  error: null,
};

type Action =
  | { type: "RESET" }
  | { type: "DECOMPOSE_START"; decision: string }
  | { type: "DECOMPOSE_DONE"; options: ForkOption[] }
  | { type: "GLOBAL_ERROR"; message: string }
  | { type: "SYNTH_START" }
  | { type: "SYNTH_DONE"; synthesis: SynthesisResult }
  | { type: "BRANCH_PATCH"; index: number; patch: Partial<BranchState> }
  | { type: "BRANCH_DELTA"; index: number; delta: string }
  | { type: "BRANCH_RESEARCH_START"; index: number; step: ResearchStep }
  | {
      type: "BRANCH_RESEARCH_DONE";
      index: number;
      toolName: string;
      preview: string;
    };

function patchBranch(
  branches: BranchState[],
  index: number,
  patch: Partial<BranchState>,
): BranchState[] {
  return branches.map((b) => (b.index === index ? { ...b, ...patch } : b));
}

function reducer(state: ForkState, action: Action): ForkState {
  switch (action.type) {
    case "RESET":
      return initialState;

    case "DECOMPOSE_START":
      return {
        ...initialState,
        phase: "decomposing",
        decision: action.decision,
      };

    case "DECOMPOSE_DONE": {
      const branches: BranchState[] = action.options.map((option, index) => ({
        index,
        option,
        sessionId: null,
        phase: "spawning",
        reasoning: "",
        conclusion: "",
        research: [],
        usage: null,
        error: null,
      }));
      return { ...state, phase: "branching", branches };
    }

    case "GLOBAL_ERROR":
      return { ...state, phase: "error", error: action.message };

    case "SYNTH_START":
      return { ...state, phase: "synthesizing" };

    case "SYNTH_DONE":
      return { ...state, phase: "complete", synthesis: action.synthesis };

    case "BRANCH_PATCH":
      return {
        ...state,
        branches: patchBranch(state.branches, action.index, action.patch),
      };

    case "BRANCH_DELTA":
      return {
        ...state,
        branches: state.branches.map((b) =>
          b.index === action.index
            ? {
                ...b,
                phase: b.phase === "researching" ? b.phase : "reasoning",
                reasoning: b.reasoning + action.delta,
              }
            : b,
        ),
      };

    case "BRANCH_RESEARCH_START":
      return {
        ...state,
        branches: state.branches.map((b) =>
          b.index === action.index
            ? {
                ...b,
                phase: "researching",
                research: [...b.research, action.step],
              }
            : b,
        ),
      };

    case "BRANCH_RESEARCH_DONE":
      return {
        ...state,
        branches: state.branches.map((b) => {
          if (b.index !== action.index) return b;
          // Mark the most recent running step of this tool as done.
          const research = [...b.research];
          for (let i = research.length - 1; i >= 0; i--) {
            if (
              research[i].status === "running" &&
              research[i].toolName === action.toolName
            ) {
              research[i] = {
                ...research[i],
                status: "done",
                preview: action.preview || research[i].preview,
              };
              break;
            }
          }
          return { ...b, research };
        }),
      };

    default:
      return state;
  }
}

function previewFromArgs(args: unknown): string {
  if (typeof args === "string") return args;
  if (args && typeof args === "object") {
    const o = args as Record<string, unknown>;
    for (const k of ["query", "q", "url", "input", "search"]) {
      if (typeof o[k] === "string") return o[k] as string;
    }
    try {
      return JSON.stringify(args).slice(0, 120);
    } catch {
      return "";
    }
  }
  return "";
}

function usageFromEvent(usage: {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
}): BranchUsage {
  const input = usage.input_tokens;
  const output = usage.output_tokens;
  const summed = (input ?? 0) + (output ?? 0);
  const total = usage.total_tokens ?? (summed > 0 ? summed : undefined);
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: total,
    costUsd: usage.cost_usd,
  };
}

export function useFork() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: "RESET" });
  }, []);

  const run = useCallback(async (decision: string) => {
    const trimmed = decision.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    dispatch({ type: "DECOMPOSE_START", decision: trimmed });

    // 1. Decompose -----------------------------------------------------------
    let options: ForkOption[];
    try {
      const res = await fetch("/api/decompose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: trimmed }),
        signal,
      });
      if (!res.ok) {
        const j = await res
          .json()
          .catch(() => ({}) as { error?: string });
        throw new Error(j.error || `Decompose failed (${res.status})`);
      }
      const data = (await res.json()) as DecomposeResult;
      options = data.options;
    } catch (err) {
      if (signal.aborted) return;
      dispatch({
        type: "GLOBAL_ERROR",
        message: err instanceof Error ? err.message : "Decompose failed.",
      });
      return;
    }
    if (signal.aborted) return;
    dispatch({ type: "DECOMPOSE_DONE", options });

    // 2. Branches (parallel) -------------------------------------------------
    // Accumulate each branch's final text locally as it streams, so synthesis
    // reads ground truth from the closure (no stale-ref / unflushed-render
    // race). Indexed by option index.
    const branchText: { conclusion: string; reasoning: string }[] = options.map(
      () => ({ conclusion: "", reasoning: "" }),
    );

    await Promise.all(
      options.map(async (option, index) => {
        try {
          await consumeSseStream(
            "/api/branch",
            { decision: trimmed, option },
            {
              signal,
              onEvent: (evt) => {
                switch (evt.type) {
                  case "branch.session":
                    dispatch({
                      type: "BRANCH_PATCH",
                      index,
                      patch: {
                        sessionId: evt.session_id ?? null,
                        phase: "researching",
                      },
                    });
                    break;
                  case "branch.error":
                    dispatch({
                      type: "BRANCH_PATCH",
                      index,
                      patch: {
                        phase: "error",
                        error: evt.message ?? "Branch stream error.",
                      },
                    });
                    break;
                  case "run.started":
                    dispatch({
                      type: "BRANCH_PATCH",
                      index,
                      patch: { phase: "researching" },
                    });
                    break;
                  case "assistant.delta":
                    if (typeof evt.delta === "string") {
                      branchText[index].reasoning += evt.delta;
                      dispatch({
                        type: "BRANCH_DELTA",
                        index,
                        delta: evt.delta,
                      });
                    }
                    break;
                  case "tool.started": {
                    const toolName =
                      typeof evt.tool_name === "string"
                        ? evt.tool_name
                        : "web";
                    const preview =
                      (typeof evt.preview === "string" && evt.preview) ||
                      previewFromArgs(evt.args) ||
                      "searching…";
                    dispatch({
                      type: "BRANCH_RESEARCH_START",
                      index,
                      step: {
                        id: `${index}-${Date.now()}-${Math.random()
                          .toString(36)
                          .slice(2, 7)}`,
                        toolName,
                        preview,
                        status: "running",
                      },
                    });
                    break;
                  }
                  case "tool.completed": {
                    const toolName =
                      typeof evt.tool_name === "string"
                        ? evt.tool_name
                        : "web";
                    const preview =
                      (typeof evt.preview === "string" && evt.preview) || "";
                    dispatch({
                      type: "BRANCH_RESEARCH_DONE",
                      index,
                      toolName,
                      preview,
                    });
                    break;
                  }
                  case "assistant.completed":
                    if (typeof evt.content === "string") {
                      branchText[index].conclusion = evt.content;
                      dispatch({
                        type: "BRANCH_PATCH",
                        index,
                        patch: { conclusion: evt.content },
                      });
                    }
                    break;
                  case "run.completed":
                    if (evt.usage) {
                      dispatch({
                        type: "BRANCH_PATCH",
                        index,
                        patch: { usage: usageFromEvent(evt.usage) },
                      });
                    }
                    break;
                  default:
                    break;
                }
              },
            },
          );
          // Stream ended: settle the branch.
          dispatch({
            type: "BRANCH_PATCH",
            index,
            patch: { phase: "done" },
          });
        } catch (err) {
          if (signal.aborted) return;
          dispatch({
            type: "BRANCH_PATCH",
            index,
            patch: {
              phase: "error",
              error: err instanceof Error ? err.message : "Branch failed.",
            },
          });
        }
      }),
    );

    if (signal.aborted) return;

    // 3. Synthesis -----------------------------------------------------------
    dispatch({ type: "SYNTH_START" });

    // Build synthesis input from the locally-accumulated branch text (ground
    // truth captured during streaming): prefer the settled conclusion, fall
    // back to the accumulated reasoning if no completion arrived.
    const synthBranches = options.map((option, index) => ({
      label: option.label,
      conclusion: branchText[index].conclusion || branchText[index].reasoning,
    }));

    try {
      const res = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: trimmed, branches: synthBranches }),
        signal,
      });
      if (!res.ok) {
        const j = await res
          .json()
          .catch(() => ({}) as { error?: string });
        throw new Error(j.error || `Synthesis failed (${res.status})`);
      }
      const synthesis = (await res.json()) as SynthesisResult;
      if (signal.aborted) return;
      dispatch({ type: "SYNTH_DONE", synthesis });
    } catch (err) {
      if (signal.aborted) return;
      dispatch({
        type: "GLOBAL_ERROR",
        message: err instanceof Error ? err.message : "Synthesis failed.",
      });
    }
  }, []);

  return { state, run, reset };
}
