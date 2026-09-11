/** Types for the React Bits <ScrollReveal /> component.
 *
 * ScrollReveal.jsx is vendored verbatim from the React Bits registry
 * (https://reactbits.dev/r/ScrollReveal-JS-CSS.json) and left unmodified so it
 * can be re-fetched cleanly. This sidecar declaration types it without editing
 * the source or enabling allowJs project-wide.
 *
 * NOTE: `children` must be a plain string — the component splits it on
 * whitespace to wrap each word in a <span>. Passing JSX yields no animation. */
import type { RefObject } from "react";

export interface ScrollRevealProps {
  children: string;
  scrollContainerRef?: RefObject<HTMLElement | null>;
  enableBlur?: boolean;
  baseOpacity?: number;
  baseRotation?: number;
  blurStrength?: number;
  containerClassName?: string;
  textClassName?: string;
  rotationEnd?: string;
  wordAnimationEnd?: string;
}

declare const ScrollReveal: (props: ScrollRevealProps) => import("react").ReactElement;
export default ScrollReveal;
