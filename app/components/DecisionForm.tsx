"use client";

import { useState } from "react";

interface Props {
  onSubmit: (decision: string) => void;
  disabled: boolean;
  running: boolean;
  onReset: () => void;
}

const EXAMPLES = [
  "Learn Rust or Go next?",
  "Take the startup offer or stay at big tech?",
  "Move to a new city or stay put?",
  "Rewrite the legacy app or refactor it in place?",
];

export function DecisionForm({ onSubmit, disabled, running, onReset }: Props) {
  const [value, setValue] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (v && !disabled) onSubmit(v);
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-2xl">
      <label
        htmlFor="decision"
        className="font-readout text-[0.62rem] uppercase tracking-[0.2em] text-ink-faint"
      >
        Name a hard decision
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id="decision"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Take job A or job B?"
          autoComplete="off"
          className="min-w-0 flex-1 bg-vellum px-4 py-3 font-body text-lg text-ink outline-none placeholder:text-ink-faint/70 focus:ring-1 focus:ring-brass"
          style={{ border: "1px solid var(--parchment-edge)" }}
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={disabled || !value.trim()}
            className="shrink-0 px-6 py-3 font-readout text-[0.7rem] uppercase tracking-[0.16em] text-vellum transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: "var(--brass-deep)" }}
          >
            {running ? "forking…" : "fork it"}
          </button>
          {running || disabled ? (
            <button
              type="button"
              onClick={onReset}
              className="shrink-0 px-4 py-3 font-readout text-[0.7rem] uppercase tracking-[0.16em] text-ink-soft transition-colors hover:text-ink"
              style={{ border: "1px solid var(--parchment-edge)" }}
            >
              reset
            </button>
          ) : null}
        </div>
      </div>

      {!disabled ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setValue(ex)}
              className="px-3 py-1.5 font-body text-[0.82rem] italic text-ink-soft transition-colors hover:text-ink"
              style={{ border: "1px solid var(--parchment-edge)" }}
            >
              {ex}
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}
