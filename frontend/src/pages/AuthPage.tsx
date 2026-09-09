import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import "@/styles/console.css";
import "@/styles/auth.css";

type Mode = "sign-in" | "sign-up";

export default function AuthPage() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setInfo("");
    setSubmitting(true);
    try {
      if (mode === "sign-in") {
        const { error } = await signIn(email, password);
        if (error) {
          setError(error);
          return;
        }
        navigate("/transform", { replace: true });
      } else {
        const { error, needsConfirmation } = await signUp(email, password);
        if (error) {
          setError(error);
          return;
        }
        if (needsConfirmation) {
          // "Confirm email" is on for this project — sign-up created the
          // account but returned no session, so there's nothing to route
          // into yet. Stay put and tell the user to check their inbox.
          setInfo("Account created — check your email to confirm before signing in.");
          return;
        }
        navigate("/transform", { replace: true });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="console-page auth-page">
      <div className="auth-frame">
        <span className="bracket-b" aria-hidden="true" />
        <div className="auth-card">
          <span className="eyebrow">{mode === "sign-in" ? "Sign in" : "Create account"}</span>
          <h1 className="auth-title">
            {mode === "sign-in" ? "Welcome back" : "Get started"}
          </h1>
          <p className="auth-sub">
            {mode === "sign-in"
              ? "Sign in to access the Transform Console."
              : "Create an account to start transforming sources."}
          </p>

          <form className="auth-form" onSubmit={onSubmit}>
            <label className="field">
              <span className="field-label">Email</span>
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>

            <label className="field">
              <span className="field-label">Password</span>
              <Input
                type="password"
                required
                minLength={6}
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>

            {error && (
              <p className="error-note" role="alert">
                {error}
              </p>
            )}
            {info && (
              <p className="auth-info" role="status">
                {info}
              </p>
            )}

            <Button type="submit" className="auth-submit" disabled={submitting}>
              {submitting
                ? mode === "sign-in"
                  ? "Signing in…"
                  : "Creating account…"
                : mode === "sign-in"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>

          <button
            type="button"
            className="auth-toggle"
            onClick={() => {
              setMode((m) => (m === "sign-in" ? "sign-up" : "sign-in"));
              setError("");
              setInfo("");
            }}
          >
            {mode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
