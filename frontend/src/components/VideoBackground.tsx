import { useReducedMotion } from "framer-motion";
import "../styles/video-bg.css";

/** Single source of truth for the background loop used on every route. */
export const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_012548_ef22562c-c0ae-4816-ad9d-f8922af4e6a7.mp4";

/** Full-viewport looping background. Fixed rather than absolute, so it stays
 * put behind pages taller than one viewport (the console scrolls; the landing
 * page does not). Decorative: hidden from assistive tech and untabbable. */
export default function VideoBackground() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="bg" aria-hidden="true">
      <video
        className="bg-video"
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
        tabIndex={-1}
        // Motion-sensitive users get a still frame rather than a loop.
        ref={(el) => {
          if (el && reduceMotion) el.pause();
        }}
      >
        <source src={VIDEO_SRC} type="video/mp4" />
      </video>
      <div className="bg-scrim" />
    </div>
  );
}
