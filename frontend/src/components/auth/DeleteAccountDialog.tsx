import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Confirmation for the real account deletion — calls the backend's
 * DELETE /api/auth/account, signs out, and lands on /auth. Shared by the
 * landing header's AccountMenu and the console's operator menu. */
export function DeleteAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function onConfirm() {
    setDeleting(true);
    setError("");
    const { error } = await deleteAccount();
    setDeleting(false);
    if (error) {
      setError(error);
      return;
    }
    onOpenChange(false);
    navigate("/auth", { replace: true });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes your account and signs you out. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="error-note" role="alert">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            onClick={(e) => {
              e.preventDefault();
              void onConfirm();
            }}
          >
            {deleting ? "Deleting…" : "Delete account"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
