import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import Home from "./pages/Home";
import Transform from "./pages/Transform";
import AuthPage from "./pages/AuthPage";

const TITLES: Record<string, string> = {
  "/": "Prisma — Turn any source into every format you need",
  "/transform": "Prisma",
  "/auth": "Sign In",
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

    // The section may not have mounted yet on a cold load, so wait for it —
    // but aim EXACTLY ONCE and then stop.
    //
    // An earlier version re-aimed every 250ms for 4s until the document height
    // stopped changing. That assumed the height settles; with the always-on
    // WebGL backdrop it never does, so the loop kept dragging the page back to
    // the anchor and the page read as "scroll is frozen" after clicking a nav
    // link. Any user scroll also cancels the pending aim.
    let cancelled = false;
    let raf = 0;
    const deadline = Date.now() + 2000;

    const stop = () => {
      cancelled = true;
    };
    // A deliberate scroll by the reader always wins over the pending aim.
    window.addEventListener("wheel", stop, { passive: true, once: true });
    window.addEventListener("touchstart", stop, { passive: true, once: true });
    window.addEventListener("keydown", stop, { once: true });

    const aim = () => {
      if (cancelled) return;
      const el = document.getElementById(id);
      if (!el) {
        if (Date.now() < deadline) raf = requestAnimationFrame(aim);
        return;
      }
      // `scroll-margin-top` on the sections keeps them clear of the fixed nav,
      // so aiming at the element itself is correct.
      el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      cancelled = true;
    };
    raf = requestAnimationFrame(aim);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };
    // `key` changes even when the same hash is clicked twice, so repeat
    // clicks re-scroll instead of doing nothing.
  }, [pathname, hash, key]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RouteTitle />
        <HashScroll />
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
        <Route
            path="/transform"
            element={
              <ProtectedRoute>
                <Transform />
              </ProtectedRoute>
            }
          />
          {/* Catch-all: any unknown path renders the landing page rather than
              a blank screen. */}
          <Route path="*" element={<Home />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
