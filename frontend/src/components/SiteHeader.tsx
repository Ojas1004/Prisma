import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import type { SectionId } from "../App";
import "../styles/header.css";

const EASE = [0.22, 1, 0.36, 1] as const;

export const NAV_LINKS = ["Home", "Product", "Case Studies", "Contact"] as const;
export type NavLabel = (typeof NAV_LINKS)[number];

/** Nav label → landing-page section. "Home" is the top of the page, so it has
 * no anchor and links to "/" plainly. */
const SECTION_FOR: Record<NavLabel, SectionId | null> = {
  Home: null,
  Product: "product",
  "Case Studies": "case-studies",
  Contact: "contact",
};

const slideDown: Variants = {
  hidden: { opacity: 0, y: -18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

const overlayIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.28 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

const menuIn: Variants = {
  hidden: { opacity: 0, y: -14, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.38, ease: EASE } },
  exit: { opacity: 0, y: -10, scale: 0.98, transition: { duration: 0.22, ease: EASE } },
};

const linkIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: EASE, delay: 0.06 * i },
  }),
};

interface SiteHeaderProps {
  /** Section currently in view on the landing page, from its scrollspy.
   * `null` means the top of the page ("Home" reads as current). The console
   * passes nothing, since no landing section is visible there. */
  activeSection?: SectionId | null;
}

/** Shared site chrome — logo, nav pill, sign-in, and the mobile sheet menu.
 * Used by both the landing page and the transform console so navigation is
 * identical across the product. Every destination is a router <Link>, so
 * history entries and back/forward behave like a normal multi-page site. */
export default function SiteHeader({ activeSection = null }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const onLanding = pathname === "/";

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    const onResize = () => window.innerWidth > 720 && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    document.body.classList.add("menu-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      document.body.classList.remove("menu-open");
    };
  }, [menuOpen]);

  /** Active state combines route and scroll position: away from the landing
   * page nothing is current; on it, the scrollspy's section wins, defaulting
   * to "Home" at the top. */
  const isActive = (label: NavLabel) => {
    if (!onLanding) return false;
    return SECTION_FOR[label] === activeSection;
  };

  const to = (label: NavLabel) => {
    const section = SECTION_FOR[label];
    return section ? `/#${section}` : "/";
  };

  return (
    <>
      <motion.header className="header" variants={slideDown} initial="hidden" animate="show">
        <Link className="logo" to="/" aria-label="Home">
          <img src="/assets/logo.webp" alt="" width={52} height={52} />
        </Link>

        <nav className="nav" aria-label="Primary">
          <ul className="nav-list">
            {NAV_LINKS.map((label) => (
              <li key={label}>
                <Link
                  className={`nav-link${isActive(label) ? " is-active" : ""}`}
                  to={to(label)}
                  aria-current={isActive(label) ? "page" : undefined}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Placeholder pending real auth — there is no login route or auth
            system yet, so this is deliberately inert rather than a link to a
            page that would 404. Wire it up when auth lands. */}
        <button className="sign-in" type="button" disabled title="Sign in is not available yet">
          Sign in
        </button>

        <button
          className="burger"
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="burger-bars" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </motion.header>

      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              className="overlay"
              variants={overlayIn}
              initial="hidden"
              animate="show"
              exit="exit"
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              className="menu"
              id="mobile-menu"
              variants={menuIn}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              <nav aria-label="Mobile">
                <ul className="menu-list">
                  {NAV_LINKS.map((label, i) => (
                    <li key={label}>
                      <motion.div variants={linkIn} initial="hidden" animate="show" custom={i}>
                        <Link
                          className={`menu-link${isActive(label) ? " is-active" : ""}`}
                          to={to(label)}
                          aria-current={isActive(label) ? "page" : undefined}
                          onClick={() => setMenuOpen(false)}
                        >
                          {label}
                        </Link>
                      </motion.div>
                    </li>
                  ))}
                </ul>
              </nav>
              {/* Same placeholder as the desktop pill — see comment above. */}
              <motion.button
                className="menu-signin"
                type="button"
                disabled
                variants={linkIn}
                initial="hidden"
                animate="show"
                custom={4}
              >
                Sign in
              </motion.button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
