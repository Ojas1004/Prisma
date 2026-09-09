import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, RefreshCw, Terminal } from "lucide-react";
import { Eyebrow, HudBrackets, RadarDot } from "./bits";

/** Hero format chips. Toggling drives the simulated terminal readout and the
 * "TRANSFORM ALL" counter — pure demo state, nothing reaches the backend. */
const FORMAT_CHIPS = [
  { key: "ARTICLES", label: "[ ARTICLES ]" },
  { key: "REPORTS", label: "[ REPORTS ]" },
  { key: "PDF", label: "[ PDF / DOCS ]" },
  { key: "MEDIA", label: "[ IMAGES / VIDEO ]" },
  { key: "PROMPTS", label: "[ PROMPTS ]" },
] as const;

const CHIP_ON =
  "px-2 py-1 rounded bg-hud-black text-cyan-300 font-mono text-[10px] tracking-[0.08em] shadow-[0_0_8px_rgba(34,211,238,0.25),inset_0_0_0_1px_#22d3ee] transition-all";
const CHIP_OFF =
  "px-2 py-1 rounded bg-hud-black text-slate-400 font-mono text-[10px] tracking-[0.08em] hover:text-cyan-300 transition-all";

/** Static decoration for the preview's side panels — a staged scene, not live
 * pipeline data. */
const STAGED_SOURCES = [
  { name: "SEC_Q3_FINANCIALS.PDF", status: "100%", meta: "4.8 MB // 142 PAGES INGESTED" },
  { name: "REUTERS_MACRO_FEED.URL", status: "100%", meta: "HTTPS_PARSE // 2,410 TOKENS" },
  { name: "POLICY_DIRECTIVE_24.DOCX", status: "READY", meta: "TEXT EMBEDDED // CLUSTER 4" },
];

const STAGED_OUTPUTS = [
  {
    kind: "ADVISORY BRIEF",
    title: "Q3 Operational Risk Vector & Capital Hedging Strategy",
    meta: "FORMAT: 2-PAGE PDF / SLACK READY",
  },
  {
    kind: "EXEC SUMMARY",
    title: "3-Minute Boardroom Synthesized Briefing",
    meta: "FORMAT: MARKDOWN / EMAIL READY",
  },
  {
    kind: "LINKEDIN THREAD",
    title: "Executive POV with carousel outline",
    meta: "FORMAT: RICH TEXT + COPY-BUFFER",
  },
];

type DispatchPhase = "idle" | "running" | "complete";

export function HeroSection() {
  const [activeChips, setActiveChips] = useState<Set<string>>(() => new Set(["PDF"]));
  const [dispatchPhase, setDispatchPhase] = useState<DispatchPhase>("idle");
  const [exported, setExported] = useState(false);
  // Fabricated cosmetic number, same caveat as TelemetryStrip.
  const [latency, setLatency] = useState(14);

  // Dispatch simulation state machine: idle → running (1.6s) → complete
  // (2.5s) → idle. Deliberately NOT wired to the real transform API — this
  // is marketing theatre; the real dispatcher lives on /transform.
  useEffect(() => {
    if (dispatchPhase === "idle") return;
    const t = window.setTimeout(
      () => setDispatchPhase(dispatchPhase === "running" ? "complete" : "idle"),
      dispatchPhase === "running" ? 1600 : 2500,
    );
    return () => window.clearTimeout(t);
  }, [dispatchPhase]);

  useEffect(() => {
    if (!exported) return;
    const t = window.setTimeout(() => setExported(false), 1800);
    return () => window.clearTimeout(t);
  }, [exported]);

  useEffect(() => {
    const id = window.setInterval(() => setLatency(12 + Math.floor(Math.random() * 5)), 4000);
    return () => window.clearInterval(id);
  }, []);

  const toggleChip = (key: string) =>
    setActiveChips((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const chosen = FORMAT_CHIPS.filter((c) => activeChips.has(c.key));
  const chosenLine = chosen.length
    ? chosen.map((c) => `[${c.key}]`).join(" ")
    : "[NONE SELECTED]";

  const sysStatus =
    dispatchPhase === "running"
      ? { text: "[ SYS_EXECUTING // DISPATCH ]", cls: "text-red-400" }
      : dispatchPhase === "complete"
        ? { text: "[ SYS_COMPLETE // 100% ]", cls: "text-hud-cyan" }
        : { text: "[ SYS_IDLE // READY ]", cls: "text-hud-cyan" };

  const dispatchLine =
    dispatchPhase === "running"
      ? {
          text: `DISPATCHING SYNTHESIS TO ${activeChips.size} PARALLEL WORKERS...`,
          cls: "text-hud-cyan animate-pulse",
        }
      : dispatchPhase === "complete"
        ? { text: "SYNTHESIS COMPLETE. DELIVERABLES STREAMED.", cls: "text-cyan-300 font-bold" }
        : { text: "READY TO DISPATCH BATCH TRANSFORMATION", cls: "text-hud-cyan" };

  return (
    <section className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 pt-12 pb-16 flex flex-col items-center text-center relative">
      {/* Eyebrow pill */}
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-hud-surface shadow-[0_0_12px_rgba(34,211,238,0.25)] mb-6">
        <RadarDot />
        <Eyebrow>[ CONTENT TRANSFORMATION ENGINE // v3.4.8 ]</Eyebrow>
      </div>

      <h1 className="font-display text-4xl md:text-6xl font-bold text-slate-100 tracking-tight leading-tight max-w-5xl mx-auto mb-4">
        Raw Source In.{" "}
        <span className="text-hud-cyan drop-shadow-[0_0_12px_rgba(34,211,238,0.35)]">
          Polished Multi-Channel Assets Out.
        </span>{" "}
        In One Pass.
      </h1>

      <p className="font-mono text-[15px] text-slate-400 max-w-3xl mx-auto mb-8 leading-relaxed">
        Transform research papers, news reports, policy briefs, and raw media into targeted
        executive deliverables simultaneously. Configure audience, tone, detail level, and style
        across seven output formats with zero context loss.
      </p>

      {/* CTAs — real routes into the authenticated console */}
      <div className="flex flex-wrap items-center justify-center gap-4 mb-16">
        <Link
          to="/transform"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-hud-surface text-hud-cyan font-mono text-xs tracking-widest uppercase shadow-[0_0_16px_rgba(34,211,238,0.35),inset_0_0_0_1px_#22d3ee] hover:bg-hud-elevated hover:shadow-[0_0_26px_rgba(34,211,238,0.6)] hover:scale-[1.02] active:scale-[0.97] transition-all"
        >
          <Terminal size={16} aria-hidden="true" />
          [ LAUNCH CONSOLE ]
        </Link>
        <Link
          to="/#case-studies"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-hud-surface text-slate-400 font-mono text-xs tracking-widest uppercase shadow-[inset_0_0_0_1px_#1a1d28] hover:text-slate-100 hover:bg-hud-elevated hover:shadow-[0_0_16px_rgba(34,211,238,0.2)] active:scale-[0.97] transition-all"
        >
          <BarChart3 size={16} aria-hidden="true" />
          [ VIEW CASE STUDIES ]
        </Link>
      </div>

      {/* Inset console viewport preview, framed in HUD corner brackets */}
      <div className="w-full max-w-5xl relative p-1 bg-hud-black shadow-[0_0_40px_rgba(0,0,0,0.85),0_0_15px_rgba(34,211,238,0.12)] overflow-hidden rounded">
        <div className="hud-sweep-line" aria-hidden="true" />
        <HudBrackets all active />

        {/* Console frame bar */}
        <div className="w-full bg-hud-elevated px-4 py-2 flex items-center justify-between text-left border-b border-hud-border">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-700 hover:bg-red-500/80 transition-colors" />
              <span className="w-2.5 h-2.5 rounded-full bg-slate-700 hover:bg-yellow-500/80 transition-colors" />
              <span className="w-2.5 h-2.5 rounded-full bg-slate-700 hover:bg-green-500/80 transition-colors" />
            </div>
            <span className="font-mono text-[11px] font-semibold text-slate-400 tracking-wider uppercase hidden sm:inline">
              TRANSFORM_OPERATOR_SHELL // CONSOLE_SESSION_#8492
            </span>
          </div>
          <div className="flex items-center gap-4 font-mono text-[10px] text-slate-400 tracking-[0.08em]">
            <span className="hidden sm:inline">
              BUFFER: <span className="text-cyan-300">16 SLOTS</span>
            </span>
            <span>
              LATENCY: <span className="text-hud-cyan tabular-nums">{latency}ms</span>
            </span>
            <span className="px-2 py-0.5 rounded bg-hud-black text-hud-cyan shadow-[inset_0_0_0_1px_rgba(34,211,238,0.3)]">
              [ LIVE SYNC ]
            </span>
          </div>
        </div>

        {/* 3-panel workspace preview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-1 p-1 bg-hud-black text-left font-mono text-[11px]">
          {/* Left: sources buffer (staged decoration) */}
          <div className="lg:col-span-3 bg-hud-surface p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] font-semibold text-slate-100 uppercase tracking-wider">
                {"// PIPELINE_INPUTS"}
              </span>
              <span className="text-[10px] text-hud-cyan">[ 3 STAGED ]</span>
            </div>
            {STAGED_SOURCES.map((s) => (
              <div
                key={s.name}
                className="p-2 bg-hud-black rounded flex flex-col gap-1 border border-transparent hover:border-cyan-500/40 transition-all"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className="truncate text-slate-100">{s.name}</span>
                  <span className="text-hud-cyan">{s.status}</span>
                </div>
                <div className="w-full bg-hud-elevated h-1 rounded-full overflow-hidden">
                  <div className="bg-hud-cyan h-full w-full shadow-[0_0_6px_#22d3ee]" />
                </div>
                <span className="text-[9px] text-slate-500 tracking-wider">{s.meta}</span>
              </div>
            ))}
            <div className="mt-auto pt-2 flex items-center justify-between text-[10px] text-slate-500">
              <span>MEM: 24.8%</span>
              <span className="text-cyan-300 text-[11px] font-semibold">[ + ADD SOURCE ]</span>
            </div>
          </div>

          {/* Center: synthesis canvas + format chips */}
          <div className="lg:col-span-6 bg-hud-surface p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <RadarDot />
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wider ${sysStatus.cls}`}
                  >
                    {sysStatus.text}
                  </span>
                </div>
                <span className="text-[10px] text-slate-600">NODE_EXEC_DISPATCH</span>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-4" role="group" aria-label="Format chips">
                {FORMAT_CHIPS.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    aria-pressed={activeChips.has(chip.key)}
                    onClick={() => toggleChip(chip.key)}
                    className={activeChips.has(chip.key) ? CHIP_ON : CHIP_OFF}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Simulated terminal readout */}
              <div className="bg-hud-black p-3 rounded text-slate-400 space-y-1 relative overflow-hidden">
                <div className="text-slate-500 text-[10px]">
                  {"// PARALLEL VECTOR SYNTHESIS STREAM INITIATED"}
                </div>
                <div className="text-slate-100">
                  &gt; Context extraction complete across 3 document streams.
                </div>
                <div className="text-cyan-300">
                  &gt; Core theses mapped: 14 key facts, 4 strategic risks, 6 operational
                  directives.
                </div>
                <div className="text-slate-400">&gt; Target deliverables chosen: {chosenLine}</div>
                <div className="flex items-center gap-2 pt-1">
                  <RefreshCw
                    size={14}
                    className={`shrink-0 ${dispatchPhase === "running" ? "animate-spin text-cyan-300" : "animate-spin text-hud-cyan"}`}
                    aria-hidden="true"
                  />
                  <span
                    className={`text-[11px] font-semibold tracking-[0.12em] ${dispatchLine.cls}`}
                  >
                    {dispatchLine.text}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 flex items-center justify-between">
              <span className="text-[10px] text-slate-500">AUTO-CALIBRATION: ACTIVE</span>
              <button
                type="button"
                onClick={() => setDispatchPhase("running")}
                disabled={dispatchPhase !== "idle"}
                className="px-3 py-1.5 rounded bg-hud-elevated text-hud-cyan font-mono text-xs tracking-wider uppercase shadow-[0_0_10px_rgba(34,211,238,0.3),inset_0_0_0_1px_#22d3ee] hover:bg-hud-border hover:shadow-[0_0_18px_rgba(34,211,238,0.5)] active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                TRANSFORM ALL ({activeChips.size} {activeChips.size === 1 ? "FORMAT" : "FORMATS"})
              </button>
            </div>
          </div>

          {/* Right: studio outputs buffer (staged decoration) */}
          <div className="lg:col-span-3 bg-hud-surface p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] font-semibold text-slate-100 uppercase tracking-wider">
                {"// STUDIO_OUTPUTS"}
              </span>
              <span className="text-[10px] text-cyan-300">LIVE QUEUE</span>
            </div>
            {STAGED_OUTPUTS.map((o) => (
              <div
                key={o.kind}
                className="p-2 bg-hud-black rounded flex flex-col gap-1 hover:shadow-[0_0_10px_rgba(34,211,238,0.2)] transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-cyan-300 font-bold group-hover:text-hud-cyan">
                    {o.kind}
                  </span>
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-hud-cyan shadow-[0_0_6px_#22d3ee]"
                    aria-hidden="true"
                  />
                </div>
                <span className="text-slate-100 line-clamp-1">{o.title}</span>
                <span className="text-[9px] text-slate-500">{o.meta}</span>
              </div>
            ))}
            <div className="mt-auto pt-2">
              <button
                type="button"
                onClick={() => setExported(true)}
                className={`w-full py-1 rounded bg-hud-elevated font-mono text-[10px] tracking-wider uppercase text-center transition-colors ${
                  exported
                    ? "text-cyan-300 border border-cyan-500/40"
                    : "text-slate-500 hover:text-slate-100 hover:bg-hud-border"
                }`}
              >
                {exported ? "[ COPIED TO WORKSPACE ]" : "[ EXPORT ALL TO WORKSPACE ]"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
