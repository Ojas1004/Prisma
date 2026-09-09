import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Eyebrow, HudBrackets, RadarDot } from "./bits";

const BRANCHES = [
  "BRANCH 01 // ADVISORY BRIEF",
  "BRANCH 02 // LINKEDIN CAROUSEL",
  "BRANCH 03 // EXEC SUMMARY",
];

/** The six calibration axes, mirroring the real parameter registry in
 * prompts.json (§7): the three `select` params use their actual option
 * values; the three free-text params (audience, language, objective) show
 * representative choices, since the real console takes typed input. This is
 * a landing-page illustration — the console loads its parameters from the
 * backend rather than hardcoding them. */
const AXES = [
  {
    key: "audience",
    label: "// AUDIENCE:",
    options: ["EXECUTIVE", "PRACTITIONER", "PUBLIC"],
    initial: "EXECUTIVE",
    cols: "grid-cols-3",
  },
  {
    key: "tone",
    label: "// TONE:",
    options: ["FORMAL", "NEUTRAL", "URGENT", "CONVERSATIONAL"],
    initial: "NEUTRAL",
    cols: "grid-cols-4",
  },
  {
    key: "language",
    label: "// LANGUAGE:",
    options: ["ENGLISH", "HINDI", "ANY"],
    initial: "ENGLISH",
    cols: "grid-cols-3",
  },
  {
    key: "detail",
    label: "// DETAIL LEVEL:",
    options: ["BRIEF", "STANDARD", "COMPREHENSIVE"],
    initial: "STANDARD",
    cols: "grid-cols-3",
  },
  {
    key: "objective",
    label: "// OBJECTIVE:",
    options: ["INFORM", "ADVISE", "WARN", "INSTRUCT"],
    initial: "ADVISE",
    cols: "grid-cols-4",
  },
  {
    key: "style",
    label: "// STYLE:",
    options: ["FACTUAL", "ANALYTICAL", "NARRATIVE", "PERSUASIVE"],
    initial: "FACTUAL",
    cols: "grid-cols-4",
  },
] as const;

const PILL_ON =
  "px-1 py-1 rounded bg-hud-elevated text-cyan-300 font-bold text-center truncate shadow-[0_0_8px_rgba(34,211,238,0.25),inset_0_0_0_1px_#22d3ee] transition-all";
const PILL_OFF =
  "px-1 py-1 rounded bg-hud-surface text-slate-400 text-center truncate hover:text-slate-100 transition-all";

const CARD =
  "bg-hud-surface p-8 rounded flex flex-col justify-between relative shadow-[0_0_20px_rgba(0,0,0,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.7),0_0_18px_rgba(34,211,238,0.18)]";

export function DifferentiatorsSection() {
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(AXES.map((a) => [a.key, a.initial])),
  );

  return (
    <section className="w-full bg-hud-surface/60 py-24 border-t border-hud-border">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
        <div className="flex flex-col items-center text-center mb-16">
          <span className="mb-2">
            <Eyebrow>[ SYSTEM ARCHITECTURE ]</Eyebrow>
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-slate-100 max-w-2xl mb-4">
            Engineered for Zero Context Loss &amp; Uncompromising Precision.
          </h2>
          <p className="font-mono text-[13px] text-slate-400 max-w-xl leading-relaxed">
            Traditional AI prompts fragment your source across multiple conversational sessions.
            Transform Console maps one unified neural context across every output channel.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Card A: branching diagram (static) */}
          <div className={CARD}>
            <HudBrackets all active />
            <div>
              <div className="flex items-center justify-between mb-4">
                <Eyebrow>[ CONTEXT CONCURRENCY ]</Eyebrow>
                <RadarDot />
              </div>
              <h3 className="font-display text-2xl font-semibold text-slate-100 mb-2">
                Simultaneous Multi-Select Synthesis
              </h3>
              <p className="font-mono text-[13px] text-slate-400 mb-6 leading-relaxed">
                Branching one source concurrently into multiple deliverables without prompt drift.
                Every deliverable is generated from the same source context in a single pass — no
                re-prompting, no drift between formats.
              </p>

              <div className="bg-hud-black p-4 rounded mb-4 font-mono text-[10px] tracking-[0.08em]">
                <div className="flex items-center gap-3 pb-3 mb-3 border-b border-hud-border flex-wrap">
                  <span className="px-2 py-1 rounded bg-hud-elevated text-slate-100">
                    [ 1 RAW SOURCE ]
                  </span>
                  <ArrowRight size={16} className="text-cyan-300 animate-pulse" aria-hidden="true" />
                  <span className="text-hud-cyan">[ NEURAL CONTEXT ANCHOR ]</span>
                </div>
                <div className="space-y-2 pl-4">
                  {BRANCHES.map((branch) => (
                    <div
                      key={branch}
                      className="flex items-center justify-between p-2 bg-hud-surface rounded hover:bg-hud-elevated transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="w-1.5 h-1.5 rounded-full bg-hud-cyan shadow-[0_0_6px_#22d3ee]"
                        />
                        <span className="text-slate-100">{branch}</span>
                      </div>
                      <span className="text-hud-cyan">WEIGHT: 100%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 font-mono text-[10px] tracking-[0.08em] text-slate-500 border-t border-hud-border/60">
              <span>SINGLE SHARED CONTEXT ACROSS FORMATS</span>
              <span className="text-cyan-300">SAME SOURCE, EVERY OUTPUT</span>
            </div>
          </div>

          {/* Card B: interactive calibration matrix */}
          <div className={CARD}>
            <HudBrackets all active />
            <div>
              <div className="flex items-center justify-between mb-4">
                <Eyebrow>[ CONTROL MATRIX ]</Eyebrow>
                <RadarDot />
              </div>
              <h3 className="font-display text-2xl font-semibold text-slate-100 mb-2">
                Granular Operator Calibration
              </h3>
              <p className="font-mono text-[13px] text-slate-400 mb-6 leading-relaxed">
                Precision parameters dial in voice, depth, and intent across all selected
                deliverables with mechanical reproducibility.
              </p>

              <div className="space-y-3 bg-hud-black p-4 rounded font-mono text-[10px] tracking-[0.08em]">
                {AXES.map((axis) => (
                  <div key={axis.key} role="group" aria-label={axis.label.replace("// ", "")}>
                    <div className="flex justify-between text-slate-600 mb-1">
                      <span>{axis.label}</span>
                      <span className="text-cyan-300">{selected[axis.key]}</span>
                    </div>
                    <div className={`grid ${axis.cols} gap-1`}>
                      {axis.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={selected[axis.key] === option}
                          onClick={() =>
                            setSelected((prev) => ({ ...prev, [axis.key]: option }))
                          }
                          className={selected[axis.key] === option ? PILL_ON : PILL_OFF}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 font-mono text-[10px] tracking-[0.08em] text-slate-500 border-t border-hud-border/60">
              <span>6 CALIBRATION AXES</span>
              <span className="text-cyan-300">APPLIED TO EVERY SELECTED FORMAT</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
