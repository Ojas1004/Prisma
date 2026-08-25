import { useState } from "react";
import Home from "./pages/Home";
import Transform from "./pages/Transform";

// State-based view switch — SPEC keeps this SPA router-free.
export default function App() {
  const [view, setView] = useState<"home" | "transform">("home");
  return view === "home" ? (
    <Home onLaunch={() => setView("transform")} />
  ) : (
    <Transform onHome={() => setView("home")} />
  );
}
