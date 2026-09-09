import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { ReactNode } from "react";
import "@/styles/console.css";

/** Matches the console's existing HUD status pattern (`.empty-status` /
 * `.empty-dot`, mono, uppercase, tracked) — the only loading affordance
 * already in the app — rather than a new generic spinner style. */
function AuthLoading() {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100dvh" }}>
      <span className="empty-status" role="status">
        <span className="empty-dot" aria-hidden="true" />
        Checking session…
      </span>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoading />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}
