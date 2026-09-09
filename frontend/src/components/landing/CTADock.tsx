import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import { Eyebrow, HudBrackets, RadarDot } from "./bits";

/** Bottom CTA dock. Carries the "contact" anchor: it is the page's closing
 * "talk to us / get started" surface, and the nav contract (SECTION_IDS)
 * requires the id to exist. */
export function CTADock() {
  return (
    <section id="contact" className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-24 scroll-mt-24">
      <div className="w-full bg-hud-surface p-8 md:p-12 rounded relative shadow-[0_0_30px_rgba(0,0,0,0.8)] flex flex-col md:flex-row items-center justify-between gap-8 transition-all duration-200 hover:shadow-[0_0_30px_rgba(0,0,0,0.8),0_0_18px_rgba(34,211,238,0.18)]">
        <HudBrackets all active />

        <div className="flex flex-col max-w-2xl text-left">
          <div className="flex items-center gap-2 mb-3">
            <RadarDot />
            <Eyebrow>[ PIPELINE READY // IMMEDIATE DEPLOYMENT ]</Eyebrow>
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-slate-100 tracking-tight mb-2">
            Ready to deploy content transformation at operator speed?
          </h2>
          <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
            Connect your data streams, choose your target formats, and generate polished executive
            assets in one synchronized pass.
          </p>
          <p className="font-mono text-[11px] text-slate-500 mt-4">
            Questions about deployment or evaluation:{" "}
            <a
              href="mailto:hello@example.com"
              className="text-cyan-300 hover:text-hud-cyan underline underline-offset-2 transition-colors"
            >
              hello@example.com
            </a>
          </p>
        </div>

        <div className="flex flex-col items-center md:items-end gap-2 shrink-0">
          <Link
            to="/transform"
            className="inline-flex items-center gap-3 px-8 py-4 rounded-full bg-hud-black text-hud-cyan font-mono text-xs tracking-widest uppercase shadow-[0_0_20px_rgba(34,211,238,0.4),inset_0_0_0_1px_#22d3ee] hover:bg-hud-elevated hover:shadow-[0_0_32px_rgba(34,211,238,0.65)] hover:scale-[1.03] active:scale-[0.97] transition-all"
          >
            <Play size={18} aria-hidden="true" />
            [ INITIALIZE CONSOLE ]
          </Link>
          <span className="font-mono text-[10px] text-slate-500 tracking-wider uppercase">
            EXEC: <span className="text-hud-cyan">⌘ + ↵</span>
          </span>
        </div>
      </div>
    </section>
  );
}
