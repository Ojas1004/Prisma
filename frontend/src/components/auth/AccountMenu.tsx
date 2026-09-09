import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { DeleteAccountDialog } from "@/components/auth/DeleteAccountDialog";
import "@/styles/account-menu.css";

/** Signed-in state of the header's account slot: shows the user's email and
 * opens a small popover (Sign out / Delete account) on click — the same
 * anchored-popover pattern the console already uses for Calibration. */
export function AccountMenu({ mobile = false }: { mobile?: boolean }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!user) return null;

  async function onSignOut() {
    setOpen(false);
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <div className={`account-menu${mobile ? " account-menu--mobile" : ""}`} ref={ref}>
      <button
        type="button"
        className="sign-in account-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {user.email}
      </button>

      {open && (
        <div className="account-pop" role="menu">
          <button type="button" role="menuitem" className="account-pop-item" onClick={onSignOut}>
            <LogOut size={15} aria-hidden="true" />
            Sign out
          </button>
          <button
            type="button"
            role="menuitem"
            className="account-pop-item account-pop-item--danger"
            onClick={() => {
              setOpen(false);
              setConfirmOpen(true);
            }}
          >
            <Trash2 size={15} aria-hidden="true" />
            Delete account
          </button>
        </div>
      )}

      <DeleteAccountDialog open={confirmOpen} onOpenChange={setConfirmOpen} />
    </div>
  );
}
