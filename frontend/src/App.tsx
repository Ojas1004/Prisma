import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import Transform from "./pages/Transform";

/** Landing-page anchor sections, in document order. Shared by the header's
 * nav, the scrollspy, and the hash-scroll handler so the three can never
 * disagree about what exists. */
export const SECTION_IDS = ["product", "case-studies", "contact"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

const TITLES: Record<string, string> = {
  "/": "Intelligence Designed To Evolve",
  "/transform": "Transform Console",
};

/** Per-route document.title, so tabs and history entries are distinguishable.
 * Unknown paths fall back to the landing title (the catch-all route renders
 * the landing page). */
function RouteTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = TITLES[pathname] ?? TITLES["/"];
  }, [pathname]);
  return null;
}

/** Native hash scrolling does not fire for client-side navigations, and on a
 * fresh load the target section usually has not mounted yet — so own the
 * behaviour explicitly for both cases. */
function HashScroll() {
  const { pathname, hash, key } = useLocation();

  useEffect(() => {
    if (!hash) {
      // A plain route change starts at the top, like a real page load.
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    const id = hash.slice(1);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // The section may not have mounted yet on a cold load, and the page keeps
    // growing after it does — the 3D hero scene and lazy images settle over
    // a second or more, which moves the target out from under a single
    // scroll. So keep re-aiming until the section actually sits at the top
    // and the document height has stopped changing.
    let cancelled = false;
    let raf = 0;
    let timer = 0;
    const deadline = Date.now() + 4000;
    let lastHeight = -1;

    const aim = () => {
      if (cancelled) return;
      const el = document.getElementById(id);
      if (!el) {
        if (Date.now() < deadline) raf = requestAnimationFrame(aim);
        return;
      }
      const height = document.documentElement.scrollHeight;
      const offset = Math.abs(el.getBoundingClientRect().top);
      const settled = height === lastHeight;
      lastHeight = height;

      // `scroll-margin-top` on the sections keeps them clear of the fixed
      // nav, so aiming at the element itself is correct.
      if (!settled || offset > 4) {
        el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      }
      if (Date.now() < deadline && (!settled || offset > 4)) {
        // Re-check on a timer rather than every frame: a smooth scroll is in
        // flight, and re-issuing it each frame would fight itself.
        timer = window.setTimeout(aim, 250);
      }
    };
    raf = requestAnimationFrame(aim);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // `key` changes even when the same hash is clicked twice, so repeat
    // clicks re-scroll instead of doing nothing.
  }, [pathname, hash, key]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <RouteTitle />
      <HashScroll />
      <Routes>
        <Route path="/transform" element={<Transform />} />
        {/* Catch-all: any unknown path renders the landing page rather than
            a blank screen. */}
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
