"use client";

import React, { useEffect, useRef, useState } from "react";
import { Suspense, lazy } from "react";
import { Link } from "react-router-dom";
import { ArrowDown } from "lucide-react";
import { SECTION_IDS } from "@/App";
import type { SectionId } from "@/App";

const Spline = lazy(() => import("@splinetool/react-spline"));

function HeroSplineBackground() {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        pointerEvents: "auto",
        overflow: "hidden",
      }}
    >
      <Suspense fallback={<div style={{ width: "100%", height: "100vh", background: "#000" }} />}>
        <Spline
          style={{
            width: "100%",
            height: "100vh",
            pointerEvents: "auto",
          }}
          scene="https://prod.spline.design/us3ALejTXl6usHZ7/scene.splinecode"
        />
      </Suspense>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100vh",
          background: `
            linear-gradient(to right, rgba(0, 0, 0, 0.8), transparent 30%, transparent 70%, rgba(0, 0, 0, 0.8)),
            linear-gradient(to bottom, transparent 50%, rgba(0, 0, 0, 0.9))
          `,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

function ScreenshotSection({ screenshotRef }: { screenshotRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <section className="relative z-10 container mx-auto px-4 md:px-6 lg:px-8 mt-11 md:mt-12">
      <div
        ref={screenshotRef}
        className="bg-gray-900 rounded-xl overflow-hidden shadow-2xl border border-gray-700/50 w-full md:w-[80%] lg:w-[70%] mx-auto"
      >
        <div>
          {/* Placeholder imagery, not a product screenshot — the alt text says
              so rather than claiming to show the console. Swap in a real
              capture of /transform when one exists. */}
          <img
            src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=2400&q=80"
            alt=""
            aria-hidden="true"
            className="w-full h-auto block rounded-lg mx-auto"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}

function HeroContent() {
  return (
    <div className="text-left text-white pt-16 sm:pt-24 md:pt-32 px-4 max-w-3xl">
      <h1 className="text-3xl sm:text-5xl md:text-7xl font-bold mb-4 leading-tight tracking-wide">
        One advisory in. <br className="sm:hidden" />
        Every briefing
        <br className="sm:hidden" /> it should become.
      </h1>
      <p className="text-base sm:text-lg md:text-xl mb-6 sm:mb-8 opacity-80 max-w-xl">
        Turn a threat advisory or incident report into a CERT-style advisory, an executive summary,
        a presentation, an infographic brief, or post copy — each written for its own audience, in
        one pass.
      </p>
      <div className="flex pointer-events-auto flex-col sm:flex-row items-start space-y-3 sm:space-y-0 sm:space-x-3">
        {/* "Start Free Trial" was reference copy — there is no signup or
            billing flow. The console is the real entry point, so the label
            says exactly that. */}
        <Link
          to="/transform"
          className="bg-[#8200DB29] hover:bg-black/50 text-white font-semibold py-2 sm:py-3 px-6 sm:px-8 rounded-full transition duration-300 w-full sm:w-auto border border-[#322D36] text-center"
          style={{ backdropFilter: "blur(8px)" }}
        >
          Open the Console
        </Link>
        {/* No product video exists, so this scrolls to the pipeline section
            rather than promising a player that isn't there. */}
        <a
          href="#product"
          className="pointer-events-auto bg-[#0009] border border-gray-600 hover:border-gray-400 text-gray-200 hover:text-white font-medium py-2 sm:py-3 px-6 sm:px-8 rounded-full transition duration-300 flex items-center justify-center w-full sm:w-auto"
        >
          <ArrowDown className="w-4 h-4 sm:w-5 sm:h-5 mr-2" aria-hidden="true" />
          See how it works
        </a>
      </div>
    </div>
  );
}

/** Nav destinations. The visual treatment is the new spec's; the wiring is the
 * app's real routing — landing anchors resolve to `/#section` and the console
 * to `/transform`, so links keep working from either route. */
const NAV_SECTIONS: { label: string; id: SectionId }[] = [
  { label: "Product", id: "product" },
  { label: "Case Studies", id: "case-studies" },
  { label: "Contact", id: "contact" },
];

function Navbar({ activeSection }: { activeSection: SectionId | null }) {
  const [hoveredNavItem, setHoveredNavItem] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleMouseEnterNavItem = (item: string) => setHoveredNavItem(item);
  const handleMouseLeaveNavItem = () => setHoveredNavItem(null);

  const toggleMobileMenu = () => setIsMobileMenuOpen((v) => !v);

  const navLinkClass = (itemName: string, isActive = false, extraClasses = "") => {
    const isCurrentItemHovered = hoveredNavItem === itemName;
    const isAnotherItemHovered = hoveredNavItem !== null && !isCurrentItemHovered;

    const colorClass = isCurrentItemHovered
      ? "text-white"
      : isAnotherItemHovered
        ? "text-gray-500"
        : isActive
          ? "text-white"
          : "text-gray-300";

    return `text-sm transition duration-150 ${colorClass} ${extraClasses}`;
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024 && isMobileMenuOpen) setIsMobileMenuOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isMobileMenuOpen]);

  // Escape closes the mobile sheet — a menu needs more than one way out.
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setIsMobileMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobileMenuOpen]);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-20"
      style={{
        backgroundColor: "rgba(13, 13, 24, 0.3)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        borderRadius: "0 0 15px 15px",
      }}
    >
      <div className="container mx-auto px-4 py-4 md:px-6 lg:px-8 flex items-center justify-between">
        <div className="flex items-center space-x-6 lg:space-x-8">
          <Link to="/" className="text-white block" aria-label="Home" style={{ width: "32px", height: "32px" }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M16 32C24.8366 32 32 24.8366 32 16C32 7.16344 24.8366 0 16 0C7.16344 0 0 7.16344 0 16C0 24.8366 7.16344 32 16 32ZM12.4306 9.70695C12.742 9.33317 13.2633 9.30058 13.6052 9.62118L19.1798 14.8165C19.4894 15.1054 19.4894 15.5841 19.1798 15.873L13.6052 21.0683C13.2633 21.3889 12.742 21.3563 12.4306 19.9991V9.70695Z"
                fill="currentColor"
              />
            </svg>
          </Link>

          <div className="hidden lg:flex items-center space-x-6">
            {NAV_SECTIONS.map((item) => (
              <Link
                key={item.id}
                to={`/#${item.id}`}
                className={navLinkClass(item.id, activeSection === item.id)}
                aria-current={activeSection === item.id ? "page" : undefined}
                onMouseEnter={() => handleMouseEnterNavItem(item.id)}
                onMouseLeave={handleMouseLeaveNavItem}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-4 md:space-x-6">
          {/* The reference had "Contact Sales" here. There is no sales team,
              and the Contact nav link already points at the same section, so
              it is removed rather than relabelled. */}
          {/* Placeholder pending real auth — inert rather than a link to a
              route that would 404. */}
          <button
            type="button"
            disabled
            title="Sign in is not available yet"
            className="hidden sm:block text-gray-300 text-sm opacity-60 cursor-not-allowed bg-transparent border-0"
          >
            Sign In
          </button>
          <Link
            to="/transform"
            className="bg-[#8200DB29] hover:bg-black/50 text-white font-semibold py-2 px-5 rounded-full text-sm md:text-base border border-[#322D36]"
            style={{ backdropFilter: "blur(8px)" }}
          >
            Open the Console
          </Link>
          <button
            className="lg:hidden text-white p-2"
            onClick={toggleMobileMenu}
            aria-label="Toggle mobile menu"
            aria-expanded={isMobileMenuOpen}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d={isMobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
              />
            </svg>
          </button>
        </div>
      </div>

      <div
        className={`lg:hidden bg-black bg-opacity-50 border-t border-gray-700/30 absolute top-full left-0 right-0 z-30
           overflow-hidden transition-all duration-300 ease-in-out
           ${isMobileMenuOpen ? "max-h-screen opacity-100 pointer-events-auto" : "max-h-0 opacity-0 pointer-events-none"}
           `}
        style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      >
        <div className="px-4 py-6 flex flex-col space-y-4">
          {NAV_SECTIONS.map((item) => (
            <Link
              key={item.id}
              to={`/#${item.id}`}
              className={`text-sm py-2 transition duration-150 ${
                activeSection === item.id ? "text-white" : "text-gray-300 hover:text-gray-100"
              }`}
              aria-current={activeSection === item.id ? "page" : undefined}
              onClick={toggleMobileMenu}
            >
              {item.label}
            </Link>
          ))}
          <Link
            to="/transform"
            className="text-gray-300 hover:text-gray-100 text-sm py-2 transition duration-150"
            onClick={toggleMobileMenu}
          >
            Transform Console
          </Link>
          <button
            type="button"
            disabled
            title="Sign in is not available yet"
            className="text-gray-300 text-sm py-2 text-left opacity-60 cursor-not-allowed bg-transparent border-0"
          >
            Sign In
          </button>
        </div>
      </div>
    </nav>
  );
}

/** Tracks which section is in view so the nav reflects scroll position, not
 * just the last click. Measures a line near the top of the viewport rather
 * than a centre band: an anchor parks its section just under the fixed nav,
 * so a short section can sit entirely above a centre band and the following
 * one would light up instead. */
function useScrollSpy(): SectionId | null {
  const [active, setActive] = useState<SectionId | null>(null);

  useEffect(() => {
    const sections = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0) return;

    const pick = () => {
      if (window.scrollY < 40) {
        setActive(null);
        return;
      }
      const line = window.innerHeight * 0.25;
      let current: SectionId | null = null;
      for (const el of sections) {
        const { top, bottom } = el.getBoundingClientRect();
        if (top <= line && bottom > line) {
          current = el.id as SectionId;
          break;
        }
        if (bottom <= line) current = el.id as SectionId;
      }
      setActive(current);
    };

    const observer = new IntersectionObserver(pick, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    sections.forEach((el) => observer.observe(el));
    window.addEventListener("scroll", pick, { passive: true });
    window.addEventListener("resize", pick);
    pick();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", pick);
      window.removeEventListener("resize", pick);
    };
  }, []);

  return active;
}

export const HeroSection = () => {
  const screenshotRef = useRef<HTMLDivElement>(null);
  const heroContentRef = useRef<HTMLDivElement>(null);
  const activeSection = useScrollSpy();

  useEffect(() => {
    const handleScroll = () => {
      if (screenshotRef.current && heroContentRef.current) {
        requestAnimationFrame(() => {
          const scrollPosition = window.pageYOffset;
          if (screenshotRef.current) {
            screenshotRef.current.style.transform = `translateY(-${scrollPosition * 0.5}px)`;
          }

          const maxScroll = 400;
          const opacity = 1 - Math.min(scrollPosition / maxScroll, 1);
          if (heroContentRef.current) {
            heroContentRef.current.style.opacity = opacity.toString();
          }
        });
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="relative">
      <Navbar activeSection={activeSection} />

      <div className="relative min-h-screen">
        <div className="absolute inset-0 z-0 pointer-events-auto">
          <HeroSplineBackground />
        </div>

        <div
          ref={heroContentRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100vh",
            display: "flex",
            justifyContent: "flex-start",
            alignItems: "center",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <div className="container mx-auto">
            <HeroContent />
          </div>
        </div>
      </div>

      <div className="bg-black relative z-10" style={{ marginTop: "-10vh" }}>
        <ScreenshotSection screenshotRef={screenshotRef} />

        {/* The anchor sections the nav points at. The spec's "Other Content
            Below" placeholder is replaced with the real destinations, since
            the shared header's anchor routing requires these ids to exist. */}
        <div className="container mx-auto px-4 py-16 text-white space-y-24">
          <section id="product" className="scroll-mt-24">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">One source, every deliverable</h2>
            <p className="max-w-2xl opacity-80 mb-10">
              The console runs a single pipeline. Material goes in once; each deliverable comes back
              written for its own medium.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["01", "Source", "Paste an article, upload a document, or attach an image. Several sources can be combined into a single run."],
                ["02", "Deliverables", "LinkedIn post, advisory, executive summary, presentation, infographic, video package, or Twitter/X copy."],
                ["03", "Calibration", "Set audience, tone, language, level of detail, objective, and style. Every parameter reaches generation."],
                ["04", "Output", "Each deliverable is generated in its own pass, streamed back as it completes, and exported as Markdown."],
              ].map(([n, title, body]) => (
                <div
                  key={n}
                  className="rounded-xl border border-gray-700/50 bg-gray-900/60 p-5"
                  style={{ backdropFilter: "blur(8px)" }}
                >
                  <span className="text-xs font-semibold tracking-widest text-gray-500">{n}</span>
                  <h3 className="mt-2 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-sm opacity-70 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="case-studies" className="scroll-mt-24">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">In development</h2>
            <p className="max-w-2xl opacity-80">
              There are no case studies here yet, and we would rather show none than invent them.
              They will be added as the platform is used in the field and the teams involved are
              able to share results.
            </p>
          </section>

          <section id="contact" className="scroll-mt-24">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Start a conversation</h2>
            <p className="max-w-2xl opacity-80 mb-6">
              Questions about deployment, evaluation, or the deliverable pipeline are all welcome.
            </p>
            <a
              href="mailto:hello@example.com"
              className="text-xl md:text-2xl font-semibold border-b-2 border-gray-600 hover:border-white transition duration-300"
            >
              hello@example.com
            </a>
            <p className="mt-4 text-sm opacity-60 max-w-xl">
              A contact form will replace this once there is a backend endpoint to receive it. Until
              then this address is the only route in, so it is the one we show.
            </p>
          </section>

          {/* Trailing room so the final sections can scroll to the top like
              any other; without it the page bottoms out early and their
              anchors land short. */}
          <div aria-hidden="true" className="h-[60vh]" />
        </div>
      </div>
    </div>
  );
};
