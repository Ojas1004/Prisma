import { useEffect, useState } from "react";

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface TypewriterProps {
  text: string;
  speedMs?: number;
  startDelayMs?: number;
  className?: string;
}

/** Character-by-character reveal with a trailing block cursor that keeps
 * blinking after the line completes. Self-contained (no animation deps);
 * renders the full text immediately under prefers-reduced-motion, and
 * exposes the complete text to screen readers from the first paint. */
export default function Typewriter({
  text,
  speedMs = 45,
  startDelayMs = 300,
  className,
}: TypewriterProps) {
  const [count, setCount] = useState(REDUCED_MOTION ? text.length : 0);

  useEffect(() => {
    if (REDUCED_MOTION) {
      setCount(text.length);
      return;
    }
    setCount(0);
    let i = 0;
    let interval: number | undefined;
    const start = window.setTimeout(() => {
      interval = window.setInterval(() => {
        i += 1;
        setCount(i);
        if (i >= text.length && interval !== undefined) {
          window.clearInterval(interval);
        }
      }, speedMs);
    }, startDelayMs);
    return () => {
      window.clearTimeout(start);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [text, speedMs, startDelayMs]);

  const typing = count < text.length;
  return (
    <span className={className} role="text" aria-label={text}>
      <span aria-hidden="true">{text.slice(0, count)}</span>
      <span aria-hidden="true" className={typing ? undefined : "cursor"}>
        █
      </span>
    </span>
  );
}
