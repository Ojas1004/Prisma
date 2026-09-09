/** Small shared HUD fragments for the landing page. The bracket and ping
 * visuals reuse the console's hud.css classes so both surfaces stay in sync. */

/** Cyan status dot wrapped in the console's sonar ping. */
export function RadarDot({ className = "w-2 h-2" }: { className?: string }) {
  return (
    <span className={`relative flex items-center justify-center shrink-0 ${className}`} aria-hidden="true">
      <span className="w-full h-full rounded-full bg-hud-cyan shadow-[0_0_6px_#22d3ee]" />
      <span className="sonar-ping absolute inset-0 rounded-full bg-hud-cyan pointer-events-none" />
    </span>
  );
}

/** Corner-bracket chrome. `all` renders all four corners, otherwise just the
 * top-left accent most cards carry. `active` adds the breathing glow. */
export function HudBrackets({ all = false, active = false }: { all?: boolean; active?: boolean }) {
  const glow = active ? " hud-bracket-active" : "";
  if (!all) return <span aria-hidden="true" className={`hud-bracket-tl${glow}`} />;
  return (
    <>
      <span aria-hidden="true" className={`hud-bracket-tl${glow}`} />
      <span aria-hidden="true" className={`hud-bracket-tr${glow}`} />
      <span aria-hidden="true" className={`hud-bracket-bl${glow}`} />
      <span aria-hidden="true" className={`hud-bracket-br${glow}`} />
    </>
  );
}

/** Mono uppercase eyebrow line used above every section heading. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] font-semibold text-hud-cyan tracking-[0.12em] uppercase">
      {children}
    </span>
  );
}
