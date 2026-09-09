import { RadarDot } from "./bits";

/** Landing footer. The mockup's Privacy/Terms links pointed at "#" and no
 * such pages exist yet, so they are omitted rather than left as dead links.
 * The latency chip is static decoration like the rest of the HUD chrome. */
export function LandingFooter() {
  return (
    <footer className="w-full bg-hud-surface py-8 border-t border-hud-border">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4 font-mono text-[10px] tracking-[0.08em] text-slate-400">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2 py-1 bg-hud-elevated rounded-lg shadow-[inset_0_0_0_1px_rgba(34,211,238,0.25)]">
            <RadarDot />
            <span className="text-hud-cyan text-[11px] font-semibold tracking-wider">
              [ SYS_OK // LATENCY: 12ms ]
            </span>
          </div>
          <span className="hidden lg:inline text-slate-600">{"// REL_ENG: v3.4.8-PROD"}</span>
        </div>
        <span className="text-slate-600 uppercase">
          © 2026 TRANSFORM CONSOLE. ALL RIGHTS RESERVED.
        </span>
      </div>
    </footer>
  );
}
