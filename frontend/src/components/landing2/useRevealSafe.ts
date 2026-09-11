import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

/** Scroll-triggered section reveal: fade + small lift, once per section.
 *
 * motion-framer patterns used (see the skill's "Scroll-Based Animations"):
 *   - `whileInView` + `viewport` for trigger detection
 *   - `viewport.once: true` so a section animates on first entry only and the
 *     observer disconnects afterwards — it never re-plays on scroll back up
 *   - parent/child `variants` with `staggerChildren` so one coordinated reveal
 *     runs per SECTION rather than per element
 *   - `useReducedMotion()` for the prefers-reduced-motion path
 *
 * The safety fallback: an earlier revision animated transform only, because
 * starting at opacity 0 leaves content invisible if IntersectionObserver never
 * fires (slow device, headless capture, odd browser). Fading is back, made safe
 * two ways: the hidden state is opacity 0.001 rather than 0, and a mount timer
 * forces the visible state after FALLBACK_MS if the observer has not fired.
 * Content can therefore never be stuck invisible.
 *
 * Only `opacity` and `transform` animate — both composited by the GPU, so no
 * layout or paint is triggered and scrolling stays smooth. */

const FALLBACK_MS = 900;

/** 400ms + this easing are the site's existing motion convention
 * (--p-dur-enter / --p-ease in prisma.css). */
const ENTER = { duration: 0.4, ease: [0.4, 0, 0.2, 1] as const };
const STAGGER = 0.06;

export function useRevealSafe() {
  const reduce = useReducedMotion();
  const [forced, setForced] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const t = window.setTimeout(() => setForced(true), FALLBACK_MS);
    return () => window.clearTimeout(t);
  }, [reduce]);

  // Reduced motion, or the fallback fired: render the final state with no
  // animation at all.
  const still = reduce || forced;

  return {
    reduce,
    /** Spread onto the section's animated container. */
    props: still
      ? ({ initial: false as const, animate: "show" as const })
      : ({
          initial: "hidden" as const,
          whileInView: "show" as const,
          viewport: { once: true, amount: 0.05, margin: "0px 0px -10% 0px" },
        }),
    container: {
      hidden: {},
      show: { transition: { staggerChildren: still ? 0 : STAGGER } },
    },
    item: {
      hidden: { opacity: 0.001, y: 12 },
      show: { opacity: 1, y: 0, transition: ENTER },
    },
  };
}
