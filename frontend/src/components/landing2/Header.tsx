import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

const NAV = [
  { label: "Formats", href: "#formats" },
  { label: "How it works", href: "#how" },
  { label: "Use cases", href: "#use-cases" },
];

/** Landing header. Nav is anchor-based (real sections on this page); both
 * CTAs resolve to real routes. */
export function Header() {
  const { session } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 bg-[#000000]/95 backdrop-blur-md transition-shadow duration-300 ${
        scrolled ? "border-b border-[#262626] shadow-[0_4px_20px_rgba(0,0,0,0.4)]" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5 shrink-0" aria-label="Prisma home">
          <img
            src="/assets/prisma-mark.webp"
            alt=""
            width={58}
            height={36}
            className="h-9 w-auto"
          />
          <span className="mono text-[length:var(--p-text-sm)] font-bold tracking-[0.18em] text-[#ffffff]">PRISMA</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="px-3.5 py-2 rounded-full text-[length:var(--p-text-sm)] text-[#a1a1a1] hover:text-[#ffffff] hover:bg-[#1a1a1a] transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {!session && (
            <Link to="/auth" className="hidden sm:inline-flex p-btn p-btn-ghost !min-h-10 !px-4">
              Sign in
            </Link>
          )}
          <Link to="/transform" className="p-btn p-btn-primary !min-h-10 !px-4 sm:!px-5">
            {session ? "Open console" : "Launch console"}
          </Link>
        </div>
      </div>
    </header>
  );
}
