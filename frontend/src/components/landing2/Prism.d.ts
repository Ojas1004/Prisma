/** Type declaration for the React Bits <Prism /> component.
 *
 * Prism.jsx is vendored verbatim from the React Bits registry
 * (https://reactbits.dev/r/Prism-JS-CSS.json) and is deliberately left
 * unmodified so it can be re-fetched cleanly on update. This sidecar
 * declaration types it without editing the source or enabling allowJs
 * project-wide. */
import type { ReactElement } from "react";

export interface PrismProps {
  height?: number;
  baseWidth?: number;
  animationType?: "rotate" | "hover" | "3drotate";
  glow?: number;
  offset?: { x?: number; y?: number };
  noise?: number;
  transparent?: boolean;
  scale?: number;
  hueShift?: number;
  colorFrequency?: number;
  hoverStrength?: number;
  inertia?: number;
  bloom?: number;
  suspendWhenOffscreen?: boolean;
  timeScale?: number;
  lightMode?: boolean;
}

declare const Prism: (props: PrismProps) => ReactElement;
export default Prism;
