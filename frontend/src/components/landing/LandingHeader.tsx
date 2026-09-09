import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Trash2, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { DeleteAccountDialog } from "@/components/auth/DeleteAccountDialog";
import type { SectionId } from "@/App";
import { RadarDot } from "./bits";

/** Same destinations the console's HudHeader uses — landing anchors resolve
 * through the shared SECTION_IDS contract, the console to /transform. */
const NAV: { label: string; to: string; section: SectionId | null }[] = [
  { label: "Home", to: "/", section: null },
  { label: "Product", to: "/#product", section: "product" },
  { label: "Case Studies", to: "/#case-studies", section: "case-studies" },
  { label: "Contact", to: "/#contact", section: "contact" },
];

const NAV_ACTIVE =
  "px-4 py-1.5 text-xs font-mono text-cyan-300 font-medium bg-cyan-500/10 rounded-full border border-cyan-500/30 shadow-[0_0_8px_rgba(34,211,238,0.15)] transition-all duration-200";
const NAV_IDLE =
  "px-4 py-1.5 text-xs font-mono text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/5 rounded-full border border-transparent transition-all duration-200";

/** Landing chrome: reticle brand, nav dock, [ ACCESS CONSOLE ] CTA, and an
 * auth-aware account slot (operator menu when signed in, sign-in link when
 * not) — the marketing-page counterpart of the console's HudHeader. */
export function LandingHeader({ activeSection }: { activeSection: SectionId | null }) {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const email = user?.email ?? "";
  const handle = email.split("@")[0] || "account";
  const initials = handle.slice(0, 2).toUpperCase();

  async function onSignOut() {
    setMenuOpen(false);
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-hud-border bg-hud-surface/90 backdrop-blur-md">
      <div className="h-16 max-w-[1440px] mx-auto px-4 sm:px-6 flex items-center justify-between gap-4">
        {/* Reticle branding — same treatment as the console header */}
        <Link to="/" className="flex items-center gap-3 group" aria-label="Home">
          <span className="relative flex items-center justify-center w-8 h-8 rounded-full border border-cyan-500/40 bg-cyan-500/5 shadow-[0_0_12px_rgba(34,211,238,0.2)]">
            <span className="absolute inset-1 rounded-full border border-cyan-400/30 group-hover:border-cyan-400/60 transition-colors" />
            <span className="w-2 h-2 rounded-full bg-hud-cyan shadow-[0_0_6px_#22d3ee]" />
            <span className="absolute w-3 h-px bg-cyan-400/60 left-0 -translate-x-1 group-hover:w-4 transition-all" />
            <span className="absolute w-3 h-px bg-cyan-400/60 right-0 translate-x-1 group-hover:w-4 transition-all" />
          </span>
          <span className="hidden sm:flex flex-col gap-0.5">
            <span className="text-xs font-mono font-bold tracking-widest text-slate-100 uppercase leading-none">
              TRANSFORM <span className="text-hud-cyan">CONSOLE</span>
            </span>
            <span className="flex items-center gap-1.5">
              <RadarDot className="w-1.5 h-1.5" />
              <span className="text-[10px] font-mono text-slate-500 tracking-wider">v3.4.8 // LIVE</span>
            </span>
          </span>
        </Link>

        {/* Center navigation dock */}
        <nav
          className="hidden md:flex items-center gap-1.5 bg-hud-elevated border border-hud-border rounded-full p-1.5 shadow-inner"
          aria-label="Primary"
        >
          {NAV.map((item) => {
            const isActive = item.section === activeSection;
            return (
              <Link
                key={item.label}
                to={item.to}
                className={isActive ? NAV_ACTIVE : NAV_IDLE}
                aria-current={isActive ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            to="/transform"
            className="hidden sm:inline-flex items-center px-4 py-2 rounded-lg bg-hud-black text-hud-cyan text-xs font-mono tracking-widest uppercase shadow-[0_0_14px_rgba(34,211,238,0.25),inset_0_0_0_1px_#22d3ee] hover:bg-hud-elevated hover:shadow-[0_0_22px_rgba(34,211,238,0.6)] active:scale-[0.97] transition-all"
          >
            [ ACCESS CONSOLE ]
          </Link>

          {/* Auth slot: operator menu for a live session, sign-in otherwise */}
          {!loading &&
            (user ? (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                  className="group flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-hud-border bg-hud-elevated hover:border-cyan-500/50 hover:shadow-[0_0_12px_rgba(34,211,238,0.2)] active:scale-[0.98] transition duration-200"
                >
                  <span className="w-6 h-6 rounded-full bg-[#11222d] border border-cyan-400/40 text-[11px] font-mono font-bold text-hud-cyan flex items-center justify-center">
                    {initials}
                  </span>
                  <ChevronDown
                    size={12}
                    className={`text-slate-500 group-hover:text-hud-cyan transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-60 rounded-lg bg-hud-surface border border-cyan-500/40 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.8),0_0_15px_rgba(34,211,238,0.15)] py-2 text-xs font-mono z-50"
                  >
                    <div className="px-3.5 py-2 border-b border-hud-border text-[10px] text-slate-500 tracking-wider truncate">
                      {email || "ACCOUNT"}
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={onSignOut}
                      className="w-full flex items-center gap-2 px-3.5 py-2 text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/10 transition text-left"
                    >
                      <LogOut size={14} className="text-slate-400" aria-hidden="true" />
                      Sign out
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3.5 py-2 text-red-400/90 hover:text-red-300 hover:bg-red-500/10 transition text-left"
                    >
                      <Trash2 size={14} className="text-red-400" aria-hidden="true" />
                      Delete account
                    </button>
                  </div>
                )}
                <DeleteAccountDialog open={confirmOpen} onOpenChange={setConfirmOpen} />
              </div>
            ) : (
              <Link
                to="/auth"
                aria-label="Sign in"
                title="Sign in"
                className="w-8 h-8 rounded-full border border-cyan-400/40 bg-cyan-500/10 flex items-center justify-center text-hud-cyan hover:shadow-[0_0_10px_rgba(34,211,238,0.5)] transition-all"
              >
                <User size={16} aria-hidden="true" />
              </Link>
            ))}
        </div>
      </div>
    </header>
  );
}
