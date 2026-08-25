import { useEffect, useState } from "react";
import Typewriter from "../components/Typewriter";
import { BASE_URL, getOutputTypes } from "../lib/api";
import type { OutputTypeInfo } from "../lib/types";

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface HomeProps {
  onLaunch: () => void;
}

interface Stat {
  label: string;
  value: string;
  bar: string;
}

// Real numbers only: 7 registry types, 3 source formats, free tier, 6 params.
const STATS: Stat[] = [
  { label: "OUTPUT TYPES", value: "7", bar: "[||||||||||||||] 7/7" },
  { label: "SOURCE FORMATS", value: "TEXT/PDF/IMG", bar: "[||||||||||||||] 3/3" },
  { label: "COST", value: "$0", bar: "[..............] FREE TIER" },
  { label: "GEN PARAMETERS", value: "6", bar: "[||||||||||||..] 6 KNOBS" },
];

export default function Home({ onLaunch }: HomeProps) {
  const [types, setTypes] = useState<OutputTypeInfo[]>([]);
  const [engineOnline, setEngineOnline] = useState<boolean | null>(null);
  const [loginMsg, setLoginMsg] = useState("");

  useEffect(() => {
    getOutputTypes()
      .then(({ output_types }) => {
        setTypes(output_types);
        setEngineOnline(true);
      })
      .catch(() => setEngineOnline(false));
  }, []);

  function scrollToOutputs() {
    document.getElementById("outputs")?.scrollIntoView({
      behavior: REDUCED_MOTION ? "auto" : "smooth",
    });
  }

  function onLogin() {
    setLoginMsg("[ERR] auth module not loaded — scheduled post-core (SPEC §8)");
    window.setTimeout(() => setLoginMsg(""), 4000);
  }

  return (
    <div className="site">
      <header className="nav">
        <span className="brand">
          {">"}_ TERMINAL<span className="cursor">_</span>
        </span>
        <nav className="nav-links" aria-label="Main">
          <button className="glitch" onClick={onLaunch}>
            ./transform
          </button>
          <button className="glitch" onClick={scrollToOutputs}>
            ./outputs
          </button>
          <a className="glitch" href={`${BASE_URL}/docs`} target="_blank" rel="noreferrer">
            ./docs
          </a>
        </nav>
        <button onClick={onLogin}>[ LOGIN ]</button>
      </header>
      <p aria-live="polite" className="err" style={{ minHeight: "1.5rem", margin: "0.25rem 0 0" }}>
        {loginMsg}
      </p>

      <section className="hero">
        <p className="hero-status">
          <span className="ok">[OK]</span> {">"} INITIALIZING TRANSFORM ENGINE...
        </p>
        <h1 className="hero-title">
          <Typewriter text="COMPILE ANY INPUT INTO ANY OUTPUT" />
        </h1>
        <p className="hero-desc dim">
          Feed it articles, reports, advisories, documents, or images. Get back
          publication-ready deliverables — LinkedIn posts, CERT-style
          advisories, executive summaries, presentation decks and more — in
          seconds, tuned by 6 generation parameters.
        </p>
        <div className="cta-row">
          <button className="btn btn--primary glitch" onClick={onLaunch}>
            [ RUN TRANSFORM ]
          </button>
          <button className="btn btn--secondary glitch" onClick={scrollToOutputs}>
            [ VIEW OUTPUT TYPES ]
          </button>
        </div>
        <p className="dim">
          STATUS:{" "}
          {engineOnline === null ? (
            <span>PROBING ENGINE...</span>
          ) : engineOnline ? (
            <span className="ok">SYSTEM ONLINE · GROQ LINK ACTIVE · AWAITING INPUT</span>
          ) : (
            <span className="err">ENGINE OFFLINE — START THE BACKEND ON :8000</span>
          )}
          <span className="cursor">█</span>
        </p>
      </section>

      <section id="outputs" aria-label="System stats and output types">
        <div className="stats-grid">
          {STATS.map((s) => (
            <div className="pane" key={s.label}>
              <p className="pane-title">+--- {s.label} ---+</p>
              <p className="pane-value">{s.value}</p>
              <p className="pane-bar">{s.bar}</p>
            </div>
          ))}
        </div>

        <ul className="outputs-list">
          {types.length > 0 ? (
            types.map((t) => (
              <li key={t.type}>
                <span className="ok">[OK]</span> ./{t.type}{" "}
                <span className="dim">— {t.description}</span>
              </li>
            ))
          ) : (
            <li>
              {engineOnline === false ? (
                <span className="err">[ERR] registry unreachable — is the backend running?</span>
              ) : (
                <span className="dim">loading registry...</span>
              )}
            </li>
          )}
        </ul>
      </section>

      <footer className="footer">
        // TERMINAL — gen AI content transformation · SIH 2026 · PS 26154 (NTRO)
        · powered by groq free tier
      </footer>
    </div>
  );
}
