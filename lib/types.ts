// Shared types for Fork — Parallel Futures.
// These mirror the verified Hermes REST + SSE event shapes.

/** A single decision option Hermes decomposed the question into. */
export interface ForkOption {
  /** Short label, e.g. "Rust". */
  label: string;
  /** One-line framing of what choosing this path means. */
  summary: string;
}

/** Response shape of /api/decompose. */
export interface DecomposeResult {
  decision: string;
  options: ForkOption[];
}

/** A research step surfaced from tool.started / tool.completed events. */
export interface ResearchStep {
  id: string;
  toolName: string;
  /** Human-readable query/args preview (from tool args or completion preview). */
  preview: string;
  status: "running" | "done";
}

/** Per-branch token/cost usage reported by run.completed. */
export interface BranchUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** Estimated USD cost if the backend provides it; otherwise derived. */
  costUsd?: number;
}

/** Lifecycle phase of a single branch's autonomous session. */
export type BranchPhase =
  | "idle"
  | "spawning"
  | "researching"
  | "reasoning"
  | "done"
  | "error";

/** Full client-side state for one parallel future being lived out. */
export interface BranchState {
  /** Index in the fork (0..N-1) — drives layout + color rotation. */
  index: number;
  option: ForkOption;
  sessionId: string | null;
  phase: BranchPhase;
  /** Accumulated assistant reasoning text (from assistant.delta). */
  reasoning: string;
  /** Final settled conclusion (from assistant.completed). */
  conclusion: string;
  research: ResearchStep[];
  usage: BranchUsage | null;
  error: string | null;
}

/** Response shape of /api/synthesize. */
export interface SynthesisResult {
  /** Label of the winning option. */
  winner: string;
  /** 0–100 confidence in the recommendation. */
  confidence: number;
  /** One-line rationale. */
  why: string;
  /**
   * For each LOSING option, one evocative line on what the person would
   * quietly miss by not taking that path. Optional — older responses omit it.
   */
  pathsNotTaken?: { label: string; regret: string }[];
}

// ---------------------------------------------------------------------------
// Hermes SSE event envelope.
//
// The stream is line-delimited SSE. Each `data:` payload is a JSON object with
// a `type` field. We type the variants we actually consume; everything else
// falls through the `HermesUnknownEvent` catch-all so parsing never throws.
// ---------------------------------------------------------------------------

export interface HermesRunStarted {
  type: "run.started";
}

export interface HermesMessageStarted {
  type: "message.started";
}

export interface HermesAssistantDelta {
  type: "assistant.delta";
  delta: string;
}

export interface HermesToolStarted {
  type: "tool.started";
  tool_name?: string;
  args?: unknown;
  preview?: string;
}

export interface HermesToolProgress {
  type: "tool.progress";
  tool_name?: string;
  preview?: string;
}

export interface HermesToolCompleted {
  type: "tool.completed";
  tool_name?: string;
  preview?: string;
  args?: unknown;
}

export interface HermesAssistantCompleted {
  type: "assistant.completed";
  content?: string;
}

export interface HermesRunCompleted {
  type: "run.completed";
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    cost_usd?: number;
  };
}

export interface HermesDone {
  type: "done";
}

export interface HermesUnknownEvent {
  type: string;
  [key: string]: unknown;
}

export type HermesEvent =
  | HermesRunStarted
  | HermesMessageStarted
  | HermesAssistantDelta
  | HermesToolStarted
  | HermesToolProgress
  | HermesToolCompleted
  | HermesAssistantCompleted
  | HermesRunCompleted
  | HermesDone
  | HermesUnknownEvent;
