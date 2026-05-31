// POST /api/decompose
// Body: { decision: string }
// Returns: { decision, options: [{ label, summary }, ...] }  (2–3 options)
//
// One Hermes call. We ask for strict JSON and parse it robustly: models love
// to wrap JSON in prose or ```json fences, so we strip fences and grab the
// first balanced object before parsing.

import { NextRequest, NextResponse } from "next/server";
import { chatOnce } from "@/lib/hermes";
import type { DecomposeResult, ForkOption } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = (decision: string) => `You break a hard decision into its concrete, mutually-distinct options.

The decision: "${decision}"

Identify the 2 to 3 most meaningful, genuinely DIFFERENT paths the person is choosing between. Do not invent a "do nothing" option unless the decision is literally about acting vs not acting. Each option must be a real fork in the road.

Respond with ONLY a JSON object, no prose, no markdown fences, in exactly this shape:
{"options":[{"label":"<2-4 word name>","summary":"<one concrete sentence: what choosing this path commits you to>"}]}

Use between 2 and 3 options.`;

export async function POST(req: NextRequest) {
  let decision: string;
  try {
    const body = (await req.json()) as { decision?: unknown };
    if (typeof body.decision !== "string" || !body.decision.trim()) {
      return NextResponse.json(
        { error: "Missing 'decision' string in body." },
        { status: 400 },
      );
    }
    decision = body.decision.trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let raw: string;
  try {
    raw = await chatOnce(SYSTEM_PROMPT(decision));
  } catch (err) {
    return NextResponse.json(
      { error: errMessage(err, "Decompose request to Hermes failed.") },
      { status: 502 },
    );
  }

  const options = parseOptions(raw);
  if (options.length < 2) {
    return NextResponse.json(
      {
        error: "Could not derive distinct options from the decision.",
        raw: raw.slice(0, 500),
      },
      { status: 422 },
    );
  }

  const result: DecomposeResult = {
    decision,
    options: options.slice(0, 3),
  };
  return NextResponse.json(result);
}

/** Robustly pull an options array out of an LLM text response. */
function parseOptions(text: string): ForkOption[] {
  const candidate = extractJsonObject(text);
  if (!candidate) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return [];
  }

  const optionsRaw = (parsed as { options?: unknown })?.options;
  if (!Array.isArray(optionsRaw)) return [];

  const out: ForkOption[] = [];
  for (const item of optionsRaw) {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const label =
        typeof o.label === "string"
          ? o.label.trim()
          : typeof o.name === "string"
            ? o.name.trim()
            : "";
      const summary =
        typeof o.summary === "string"
          ? o.summary.trim()
          : typeof o.description === "string"
            ? o.description.trim()
            : "";
      if (label) out.push({ label, summary });
    } else if (typeof item === "string" && item.trim()) {
      out.push({ label: item.trim(), summary: "" });
    }
  }
  return out;
}

/** Strip ```fences``` and return the first balanced {...} block. */
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
