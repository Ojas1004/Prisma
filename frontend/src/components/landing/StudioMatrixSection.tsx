import { useState } from "react";
import { MousePointerClick } from "lucide-react";
import { TypeIcon } from "@/components/ui/ai-chat-input";
import { Eyebrow, HudBrackets } from "./bits";

/** The seven real output types, keyed by the backend registry's type ids so
 * TypeIcon renders the exact icons the console's Studio panel uses. Copy is
 * marketing voice; the list itself mirrors prompts.json. */
const CARDS = [
  {
    type: "video",
    code: "[ 01 // A/V ]",
    title: "Video Package",
    body: "Camera directions, voiceover script blocks, precise timestamp markers, and B-roll callouts formatted directly for executive video production.",
    footLeft: "TIMESTAMPS: YES",
    footRight: "VO_CUES // OK",
  },
  {
    type: "linkedin_post",
    code: "[ 02 // EXEC_POV ]",
    title: "LinkedIn Post",
    body: "High-authority executive takeaways, scroll-stopping contextual hooks, and cleanly structured bullet syntax tuned for senior network distribution.",
    footLeft: "HOOK SYNTHESIS",
    footRight: "C-SUITE TONE",
  },
  {
    type: "twitter_post",
    code: "[ 03 // DISPATCH ]",
    title: "Twitter/X Post",
    body: "High-impact serialized thread breakdowns, single-tweet distillation, and modular quote blocks optimized for rapid viral telemetry.",
    footLeft: "THREADED // 280-CH",
    footRight: "NUMERICAL HOOKS",
  },
  {
    type: "advisory",
    code: "[ 04 // BRIEFING ]",
    title: "Advisory",
    body: "Structured briefing documents with clear findings, recommendations, and risk context — formatted for fast decision-making.",
    footLeft: "AUDIENCE: LEADERSHIP",
    footRight: "DECISION READY",
    featured: true,
  },
  {
    type: "infographic",
    code: "[ 05 // DATA_VIZ ]",
    title: "Infographic",
    body: "Clear visual hierarchy descriptions, statistical metric callouts, flow schemas, and designer handoff prompts ready for vector drafting.",
    footLeft: "METRIC ISOLATION",
    footRight: "LAYOUT SCHEMAS",
  },
  {
    type: "executive_summary",
    code: "[ 06 // TL;DR ]",
    title: "Executive Summary",
    body: "Condensed strategic synthesis, decision-tree condensations, and essential bottom-line implications tailored for the board deck.",
    footLeft: "DENSITY: MAX",
    footRight: "DECISION-FOCUSED",
  },
  {
    type: "presentation",
    code: "[ 07 // KEYNOTE ]",
    title: "Presentation Deck",
    body: "Slide-by-slide outline including headline narrative, visual focal points, detailed presenter talking points, and audience Q&A defense scripts.",
    footLeft: "SPEAKER NOTES: INCLUDED",
    footRight: "DECK ARCHITECTURE // 10-15 SLIDES",
    wide: true,
  },
];

const CARD_BASE =
  "p-6 rounded flex flex-col justify-between relative group text-left w-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.7),0_0_18px_rgba(34,211,238,0.18)]";
const CARD_ON = "bg-hud-elevated border border-cyan-500/50 shadow-[0_0_20px_rgba(34,211,238,0.22)]";
const CARD_OFF = "bg-hud-elevated/40 border border-hud-border hover:border-cyan-500/40";

/** Interactive deliverables grid — a demo of the console's multi-select, with
 * the same initial four selections as the mockup. Landing-only state. */
export function StudioMatrixSection() {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(["linkedin_post", "advisory", "executive_summary", "presentation"]),
  );

  const toggle = (type: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  return (
    <section
      id="product"
      className="w-full bg-hud-surface/60 py-24 border-y border-hud-border scroll-mt-24"
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
        <div className="flex flex-col items-center text-center mb-16">
          <span className="mb-2">
            <Eyebrow>[ STUDIO OUTPUT MATRIX ]</Eyebrow>
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-slate-100 max-w-2xl mb-4">
            Seven Purpose-Built Deliverables. Selected &amp; Generated Simultaneously.
          </h2>
          <p className="font-mono text-[13px] text-slate-400 max-w-xl leading-relaxed">
            Zero prompt chaining. Zero context degradation. Click multiple formats, configure
            operator weights, and generate synchronized deliverables from the exact same source
            baseline.
          </p>
          <div className="mt-3 font-mono text-[10px] tracking-[0.08em] text-slate-500 flex items-center gap-2">
            <MousePointerClick size={16} className="text-cyan-300" aria-hidden="true" />
            <span>
              CLICK CARDS TO TOGGLE ACTIVE GENERATION QUEUE (
              <span className="text-hud-cyan">{selected.size}</span>
              /7 SELECTED)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {CARDS.map((card) => {
            const on = selected.has(card.type);
            return (
              <button
                key={card.type}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(card.type)}
                className={`${CARD_BASE} ${on ? CARD_ON : CARD_OFF} ${
                  card.wide ? "lg:col-span-2 xl:col-span-2" : ""
                }`}
              >
                <HudBrackets all={card.featured} active={Boolean(card.featured)} />
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span
                      className={`w-10 h-10 rounded bg-hud-black flex items-center justify-center text-hud-cyan group-hover:text-cyan-300 ${
                        card.featured
                          ? "shadow-[0_0_10px_rgba(34,211,238,0.4)]"
                          : "shadow-[0_0_6px_rgba(0,0,0,0.5)]"
                      }`}
                    >
                      <TypeIcon type={card.type} className="w-6 h-6" />
                    </span>
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`w-2 h-2 rounded-full ${
                          on ? "bg-hud-cyan shadow-[0_0_8px_#22d3ee]" : "bg-slate-600"
                        }`}
                      />
                      <span
                        className={`font-mono text-[11px] font-semibold tracking-wider ${
                          card.featured ? "text-hud-cyan" : "text-slate-500"
                        }`}
                      >
                        {card.code}
                      </span>
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-medium text-slate-100 mb-2 group-hover:text-cyan-300 transition-colors">
                    {card.title}
                  </h3>
                  <p className="font-mono text-[13px] text-slate-400 mb-4 leading-relaxed">
                    {card.body}
                  </p>
                </div>
                <div className="pt-3 flex items-center justify-between font-mono text-[10px] tracking-[0.08em] text-slate-500 border-t border-hud-border/60 w-full">
                  <span>{card.footLeft}</span>
                  <span className={card.featured ? "text-cyan-300 font-bold" : "text-hud-cyan"}>
                    {card.footRight}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
