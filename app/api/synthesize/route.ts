// POST /api/synthesize
// Body: { decision: string, branches: [{ label, conclusion }, ...] }
// Returns: { winner, confidence (0-100), why, pathsNotTaken? }
//
// One Hermes call. Feeds the N lived-out futures back and asks for a single
// recommendation with a calibrated confidence, plus one quiet line of regret
// per losing path. Strict-JSON parse, same robust extraction as decompose.

import { NextRequest, NextResponse } from "next/server";
import { chatOnce } from "@/lib/hermes";
import type { SynthesisResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BranchConclusionInput {
  label: string;
  conclusion: string;
}

function synthPrompt(
  decision: string,
  branches: BranchConclusionInput[],
): string {
  const futures = branches
    .map(
      (b, i) =>
        `--- FUTURE ${i + 1}: ${b.label} ---\n${b.conclusion || "(no conclusion recorded)"}`,
    )
    .join("\n\n");

  return `You are the oracle that has now watched ${branches.length} parallel futures play out for this decision:

"${decision}"

Here is what happened in each lived-out future:

${futures}

Weigh them against each other. Pick the ONE path you'd recommend. Set a calibrated confidence from 0 to 100 — be honest: a near-tie is ~55, a clear win is ~85+. Give one sharp sentence on why.

Then, for each path you did NOT recommend, write a single quiet, vivid line of regret: what this person would have quietly missed by not taking it. One sentence each. Specific and humane, never cheesy, never a sales pitch — the small ache of the road not walked.

Respond with ONLY a JSON object, no prose, no markdown fences, in exactly this shape:
{"winner":"<the exact label of the recommended option>","confidence":<integer 0-100>,"why":"<one sentence>","pathsNotTaken":[{"label":"<exact label of a losing option>","regret":"<one vivid sentence>"}]}`;
}

export async function POST(req: NextRequest) {
  let decision: string;
  let branches: BranchConclusionInput[];
  try {
    const body = (await req.json()) as {
      decision?: unknown;
      branches?: unknown;
    };
    if (typeof body.decision !== "string" || !body.decision.trim()) {
      return NextResponse.json({ error: "Missing 'decision'." }, { status: 400 });
    }
    if (!Array.isArray(body.branches) || body.branches.length === 0) {
      return NextResponse.json(
        { error: "Missing non-empty 'branches' array." },
        { status: 400 },
      );
    }
    decision = body.decision.trim();
    branches = body.branches
      .map((b) => {
        const o = (b ?? {}) as Record<string, unknown>;
        return {
          label: typeof o.label === "string" ? o.label.trim() : "",
          conclusion:
            typeof o.conclusion === "string" ? o.conclusion.trim() : "",
        };
      })
      .filter((b) => b.label.length > 0);
    if (branches.length === 0) {
      return NextResponse.json(
        { error: "No valid branches with labels." },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let raw: string;
  try {
    raw = await chatOnce(synthPrompt(decision, branches));
  } catch (err) {
    return NextResponse.json(
      { error: errMessage(err, "Synthesis request to Hermes failed.") },
      { status: 502 },
    );
  }

  const result = parseSynthesis(raw, branches);
  if (!result) {
    return NextResponse.json(
      { error: "Could not parse a recommendation.", raw: raw.slice(0, 500) },
      { status: 422 },
    );
  }
  return NextResponse.json(result);
}

function parseSynthesis(
  text: string,
  branches: BranchConclusionInput[],
): SynthesisResult | null {
  const candidate = extractJsonObject(text);
  if (!candidate) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    return null;
  }

  const winnerRaw =
    typeof parsed.winner === "string" ? parsed.winner.trim() : "";
  if (!winnerRaw) return null;

  // Snap the winner to the closest known label so casing/whitespace from the
  // model doesn't break downstream matching.
  const winner = snapToLabel(winnerRaw, branches);

  let confidence = 0;
  const cRaw = parsed.confidence;
  if (typeof cRaw === "number") confidence = cRaw;
  else if (typeof cRaw === "string") confidence = parseFloat(cRaw);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(100, Math.round(confidence)));

  const why = typeof parsed.why === "string" ? parsed.why.trim() : "";

  const pathsNotTaken = parsePathsNotTaken(parsed.pathsNotTaken, branches, winner);

  return { winner, confidence, why, pathsNotTaken };
}

/**
 * Defensively read the regret lines. Tolerates the field being missing or
 * malformed (older behavior must still work). Snaps each label to a known
 * branch, drops anything pointing at the winner, and de-dupes by label.
 */
function parsePathsNotTaken(
  raw: unknown,
  branches: BranchConclusionInput[],
  winner: string,
): { label: string; regret: string }[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: { label: string; regret: string }[] = [];
  for (const entry of raw) {
    const o = (entry ?? {}) as Record<string, unknown>;
    const labelRaw = typeof o.label === "string" ? o.label.trim() : "";
    const regret = typeof o.regret === "string" ? o.regret.trim() : "";
    if (!labelRaw || !regret) continue;
    const label = snapToLabel(labelRaw, branches);
    if (label === winner) continue; // regrets are for losing paths only
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, regret });
  }
  return out;
}

function snapToLabel(
  winner: string,
  branches: BranchConclusionInput[],
): string {
  const lower = winner.toLowerCase();
  const exact = branches.find((b) => b.label.toLowerCase() === lower);
  if (exact) return exact.label;
  const contains = branches.find(
    (b) =>
      lower.includes(b.label.toLowerCase()) ||
      b.label.toLowerCase().includes(lower),
  );
  return contains ? contains.label : winner;
}

function extractJsonObject(text: string): string | null {
  const cleaned = text
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  return null;
}

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
