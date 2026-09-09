import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import type { ParameterInfo } from "@/lib/types";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Groq's accepted values for gpt-oss-120b, per console.groq.com/docs/reasoning.
 * Deliberately not shared with the vision model, which takes none|default. */
const REASONING_EFFORTS = [
  { value: "low", label: "Low", hint: "Fastest. Least deliberation." },
  { value: "medium", label: "Medium", hint: "Balanced." },
  { value: "high", label: "High", hint: "Most thorough. Default." },
] as const;

export function CalibrationPopover({
  parameters,
  params,
  setParams,
  onClose,
  reduceMotion,
}: {
  parameters: ParameterInfo[];
  params: Record<string, string>;
  setParams: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onClose: () => void;
  reduceMotion: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // The dock's Calibrate pill handles its own click; only close on true outside.
      if (
        ref.current &&
        !ref.current.contains(target) &&
        !target.closest('[data-calibrate-toggle="true"]')
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  return (
    <motion.div
      className="calib-pop"
      ref={ref}
      role="dialog"
      aria-label="Calibration settings"
      initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.16 } }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      <div className="panel-head">
        <span className="eyebrow">Calibration</span>
        <button className="icon-btn" type="button" onClick={onClose} aria-label="Close calibration">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {/* An API parameter, not a prompt parameter — kept visually separate
          from the values that get written into the prompt text. */}
      <div className="calib-effort">
        <span className="field-label">Reasoning effort</span>
        <div className="effort-row" role="radiogroup" aria-label="Reasoning effort">
          {REASONING_EFFORTS.map((e) => {
            const on = (params.reasoning_effort ?? "high") === e.value;
            return (
              <button
                key={e.value}
                type="button"
                role="radio"
                aria-checked={on}
                title={e.hint}
                className={`effort-opt${on ? " is-on" : ""}`}
                onClick={() => setParams((prev) => ({ ...prev, reasoning_effort: e.value }))}
              >
                {e.label}
              </button>
            );
          })}
        </div>
        <p className="effort-hint">
          How hard the model thinks before writing. Higher is slower and more thorough.
        </p>
      </div>

      <div className="param-grid">
        {parameters.map((p) => (
          <label className="field" key={p.key}>
            <span className="field-label">{p.label}</span>
            {p.kind === "select" ? (
              <select
                value={params[p.key] ?? ""}
                onChange={(e) => setParams((prev) => ({ ...prev, [p.key]: e.target.value }))}
              >
                <option value="">Not set</option>
                {p.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={params[p.key] ?? ""}
                placeholder={p.placeholder}
                onChange={(e) => setParams((prev) => ({ ...prev, [p.key]: e.target.value }))}
              />
            )}
          </label>
        ))}
      </div>
    </motion.div>
  );
}
