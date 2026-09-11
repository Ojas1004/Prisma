import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { DeleteAccountDialog } from "@/components/auth/DeleteAccountDialog";

/** Same destinations as SiteHeader's nav — real router links into the
 * landing page and its anchor sections, not decorative tab-switching. */
const NAV = [
  { label: "Home", to: "/" },
  { label: "Product", to: "/#product" },
  { label: "Case Studies", to: "/#case-studies" },
  { label: "Contact", to: "/#contact" },
] as const;

const NAV_ACTIVE =
  "px-5 py-1.5 text-xs font-mono text-cyan-300 font-medium bg-cyan-500/10 rounded-full border border-cyan-500/30 shadow-[0_0_8px_rgba(34,211,238,0.15)] transition-all duration-200";
const NAV_IDLE =
  "px-5 py-1.5 text-xs font-mono text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/5 hover:border-cyan-500/20 rounded-full border border-transparent transition-all duration-200";

/** Console chrome: target-reticle brand, nav dock, and the operator
 * account control (real session — sign out and delete account). */
export function HudHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();
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

  // On the console route none of the landing destinations is current;
  // active state only lights up when actually on the landing page.
  const isActive = (to: string) =>
    pathname === "/" && (to === "/" ? hash === "" : hash === to.slice(1));

  const email = user?.email ?? "";
  const handle = email.split("@")[0] || "account";
  const initials = handle.slice(0, 2).toUpperCase();

  async function onSignOut() {
    setMenuOpen(false);
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <header className="h-16 border-b border-hud-border bg-hud-surface/90 backdrop-blur px-4 sm:px-8 flex items-center justify-between z-30 shrink-0 select-none relative">
      {/* Left target-reticle branding */}
      <Link to="/" className="flex items-center gap-4 group" aria-label="Home">
        <span className="relative flex items-center justify-center w-8 h-8 rounded-full border border-cyan-500/40 bg-cyan-500/5 shadow-[0_0_12px_rgba(34,211,238,0.2)]">
          <span className="absolute inset-1 rounded-full border border-cyan-400/30 group-hover:border-cyan-400/60 transition-colors" />
          <span className="w-2 h-2 rounded-full bg-hud-cyan shadow-[0_0_6px_#22d3ee]" />
          <span className="absolute w-3 h-px bg-cyan-400/60 left-0 -translate-x-1 group-hover:w-4 transition-all" />
          <span className="absolute w-3 h-px bg-cyan-400/60 right-0 translate-x-1 group-hover:w-4 transition-all" />
        </span>
        <img
          src="/assets/prisma-mark.webp"
          alt="Prisma"
          width={58}
          height={36}
          className="h-9 w-auto shrink-0 drop-shadow-[0_0_8px_rgba(34,211,238,0.35)]"
        />
        <span className="hidden sm:flex flex-col gap-0.5">
          <span className="text-xs font-mono font-bold tracking-widest text-slate-100 uppercase leading-none">
            PRIS<span className="text-hud-cyan">MA</span>
          </span>
          <span className="text-[10px] font-mono text-slate-500 tracking-wider">v3.4.8 // LIVE</span>
        </span>
      </Link>

      {/* Center navigation dock — real routes */}
      <nav
        className="hidden md:flex items-center gap-1.5 bg-hud-elevated border border-hud-border rounded-full p-1.5 shadow-inner"
        aria-label="Primary"
      >
        {NAV.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className={isActive(item.to) ? NAV_ACTIVE : NAV_IDLE}
            aria-current={isActive(item.to) ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Right operator account control — the real session */}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="group flex items-center gap-3 px-3.5 py-1.5 rounded-full border border-hud-border bg-hud-elevated hover:border-cyan-500/50 hover:shadow-[0_0_12px_rgba(34,211,238,0.2)] active:scale-[0.98] transition duration-200"
        >
          <span className="w-6 h-6 rounded-full bg-[#11222d] border border-cyan-400/40 text-[11px] font-mono font-bold text-hud-cyan flex items-center justify-center group-hover:shadow-[0_0_8px_rgba(34,211,238,0.4)] transition">
            {initials}
          </span>
          <span className="hidden sm:inline text-xs font-mono text-slate-300 group-hover:text-white transition max-w-40 truncate">
            {handle}
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
    </header>
  );
}
