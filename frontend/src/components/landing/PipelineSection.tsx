import { SlidersHorizontal, Upload, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Eyebrow, HudBrackets } from "./bits";

const NODES: {
  code: string;
  icon: LucideIcon;
  title: string;
  body: string;
  statLabel: string;
  statValue: string;
}[] = [
  {
    code: "[ NODE_01 ]",
    icon: Upload,
    title: "Ingest Source Material",
    body: "Paste or upload news articles, policy documents, research reports, images, or free-form operator prompts into the ingestion pipeline buffer.",
    statLabel: "// SUPPORTED PROTOCOLS:",
    statValue: "PDF, TXT, MD, PNG/JPG/WEBP, RAW_TEXT",
  },
  {
    code: "[ NODE_02 ]",
    icon: SlidersHorizontal,
    title: "Calibrate & Select Formats",
    body: "Multi-select target deliverables from the Studio grid and fine-tune generation parameters (Audience, Tone, Language, Detail Level, Objective, and Style).",
    statLabel: "// PARAMETERS ACTIVE:",
    statValue: "6 CALIBRATION AXES // MULTI-SELECT",
  },
  {
    code: "[ NODE_03 ]",
    icon: Zap,
    title: "Simultaneous Generation",
    body: "Execute single-pass transformation. Deliverables populate the Studio Output buffer as each completes, ready for operator review and clipboard export.",
    statLabel: "// DISPATCH MODE:",
    statValue: "SINGLE-PASS DISPATCH // NO SEQUENTIAL RE-PROMPTING",
  },
];

/** Static 3-node "how it works" flow. */
export function PipelineSection() {
  return (
    <section className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-24">
      <div className="flex flex-col items-center text-center mb-16">
        <span className="mb-2">
          <Eyebrow>[ EXECUTION PIPELINE ]</Eyebrow>
        </span>
        <h2 className="font-display text-3xl md:text-4xl font-semibold text-slate-100 max-w-2xl mb-4">
          From Raw Source to Cohesive Distribution in Seconds.
        </h2>
        <p className="font-mono text-[13px] text-slate-400 max-w-xl leading-relaxed">
          A single deterministic pass eliminates the friction of prompt fragmentation, context
          drifts, and cross-channel inconsistencies.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
        {NODES.map((node) => (
          <div
            key={node.code}
            className="bg-hud-surface p-6 rounded flex flex-col justify-between relative shadow-[0_0_12px_rgba(0,0,0,0.4)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.7),0_0_18px_rgba(34,211,238,0.18)]"
          >
            <HudBrackets />
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-[11px] font-bold text-hud-cyan tracking-[0.12em]">
                  {node.code}
                </span>
                <node.icon size={20} className="text-slate-600" aria-hidden="true" />
              </div>
              <h3 className="font-display text-lg font-medium text-slate-100 mb-2 uppercase">
                {node.title}
              </h3>
              <p className="font-mono text-[13px] text-slate-400 mb-4 leading-relaxed">
                {node.body}
              </p>
            </div>
            <div className="bg-hud-black p-3 rounded font-mono text-[10px] tracking-[0.08em] text-slate-600 space-y-1">
              <div>{node.statLabel}</div>
              <div className="text-cyan-300">{node.statValue}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
