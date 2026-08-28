import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Palette first: component stylesheets and the Tailwind theme both consume
// these custom properties.
import "./styles/theme.css";
import "./styles/tailwind.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
