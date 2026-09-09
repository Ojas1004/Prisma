import { useEffect, useState } from "react";
import { RadarDot } from "./bits";

/** Ambient telemetry strip under the header.
 *
 * Every number here is FABRICATED landing-page decoration carried over from
 * the mockup — nothing is measured from the backend, and the fluctuation is
 * a cosmetic timer. Do not wire real metrics in without redesigning this as
 * an honest status readout (the console's /health line is the real one). */
export function TelemetryStrip() {
  const [latency, setLatency] = useState(14);
  const [throughput, setThroughput] = useState(1482);

  useEffect(() => {
    const id = window.setInterval(() => {
      setLatency(12 + Math.floor(Math.random() * 5));
      setThroughput(1475 + Math.floor(Math.random() * 18));
    }, 4000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="w-full bg-hud-surface py-2 px-4 sm:px-6 flex flex-wrap items-center justify-between gap-y-2 border-b border-hud-border font-mono text-[10px] tracking-[0.08em]">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <RadarDot className="w-1.5 h-1.5" />
          <span className="text-[11px] font-semibold text-cyan-300 tracking-[0.12em] uppercase">
            STATUS: OPERATIONAL
          </span>
        </div>
        <span className="text-slate-600 hidden md:inline" aria-hidden="true">
          |
        </span>
        <span className="text-slate-400">
          LATENCY: <span className="text-cyan-300 tabular-nums">{latency}ms</span>
        </span>
        <span className="text-slate-600 hidden md:inline" aria-hidden="true">
          |
        </span>
        <span className="text-slate-400">
          THROUGHPUT:{" "}
          <span className="text-slate-100 tabular-nums">{throughput.toLocaleString()} DOCS/SEC</span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-slate-400 uppercase">STATE:</span>
        <span className="px-2 py-0.5 rounded bg-hud-elevated text-hud-cyan text-[11px] font-semibold tracking-[0.12em] shadow-[0_0_10px_rgba(34,211,238,0.2)]">
          [ MULTI-FORMAT ENGINE // LIVE ]
        </span>
      </div>
    </div>
  );
}
