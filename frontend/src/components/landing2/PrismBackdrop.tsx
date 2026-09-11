import { useReducedMotion } from "framer-motion";
import Prism from "./Prism";

/** Page-wide Prism backdrop.
 *
 * Fixed to the viewport rather than scoped to the hero, so the prism stays
 * visible behind every section as the page scrolls. It sits at z-0 with the
 * page content at z-10 above it, and is pointer-events-none so it never
 * intercepts clicks.
 *
 * Colours are the component's own defaults (hueShift 0, colorFrequency 1) —
 * unchanged from the React Bits source. Skipped entirely under
 * prefers-reduced-motion. */
export function PrismBackdrop() {
  const reduce = useReducedMotion();
  if (reduce) return null;

  return (
    <div
      className="fixed inset-0 z-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      <Prism
        animationType="hover"
        timeScale={0.5}
        height={3.5}
        baseWidth={5.5}
        scale={2.5}
        hueShift={0}
        colorFrequency={1}
        noise={0.5}
        glow={1}
      />
      {/* Page-wide scrim: keeps body copy legible over the WebGL layer without
          touching the prism's own colours. */}
      <div className="absolute inset-0 bg-[#000000]/55 sm:bg-transparent sm:bg-gradient-to-r sm:from-[#000000] sm:via-[#000000]/75 sm:to-transparent" />
    </div>
  );
}
