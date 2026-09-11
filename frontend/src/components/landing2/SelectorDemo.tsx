import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useRevealSafe } from "./useRevealSafe";
import { Check, FileText, Image as ImageIcon, MessageSquare, FileType } from "lucide-react";
import { OUTPUTS, PARAMETERS } from "./data";
import ScrollReveal from "./ScrollReveal";

const SOURCE_KINDS = [
  { id: "document", label: "Document", icon: FileText, hint: "Article, report, research paper, policy doc" },
  { id: "pdf", label: "PDF / file", icon: FileType, hint: "Uploaded PDF, Markdown or text file" },
  { id: "image", label: "Image", icon: ImageIcon, hint: "Screenshot, chart or scanned page" },
  { id: "prompt", label: "Prompt", icon: MessageSquare, hint: "Free-form instruction, no document needed" },
] as const;

/** Interactive source -> outputs selector.
 *
 * This is the "show, don't tell" section from the ai-driven-dynamic-landing
 * pattern. It demonstrates multi-select for real — the visitor toggles actual
 * output types and sees the run compose. It deliberately does NOT fabricate
 * generated content: it shows what WOULD be produced, and the real generation
 * happens in the console. */
export function SelectorDemo() {
  const reduce = useReducedMotion();
  const { props: reveal, container, item } = useRevealSafe();
  const [source, setSource] = useState<string>("document");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(["executive_summary", "linkedin_post"]));

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const activeSource = SOURCE_KINDS.find((s) => s.id === source)!;
  const count = picked.size;

  return (
    <motion.section
      {...reveal}
      variants={container}
      className="mx-auto max-w-7xl px-4 sm:px-6 py-[var(--p-space-2xl)]"
    >
      <motion.div variants={item} className="max-w-2xl">
        <span className="mono text-[length:var(--p-text-xs)] uppercase tracking-[0.18em] text-[#a1a1a1]">Try the selection</span>
        <h2 className="mt-3 font-semibold tracking-tight" style={{ fontSize: "var(--p-text-2xl)", lineHeight: 1.15 }}>
          One source. As many formats as you select.
        </h2>
        <ScrollReveal
          baseOpacity={0}
          enableBlur={true}
          baseRotation={5}
          blurStrength={10}
          containerClassName="!mt-3 !mb-0"
          textClassName="!text-[length:var(--p-text-base)] !font-normal !leading-relaxed text-[#a1a1a1]"
        >
          {"Pick a source type, then toggle the deliverables you want. In the console every selected format is generated in the same run, from the same reading."}
        </ScrollReveal>
      </motion.div>

      <motion.div variants={item} className="mt-[var(--p-space-lg)] grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* ── Source picker ── */}
        <div className="p-card p-[var(--p-space-md)]">
          <p className="mono text-[length:var(--p-text-label)] uppercase tracking-[0.16em] text-[#737373]">1 · Source</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {SOURCE_KINDS.map((s) => {
              const Icon = s.icon;
              const on = source === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSource(s.id)}
                  aria-pressed={on}
                  className={`flex flex-col items-start gap-1.5 rounded-[var(--p-radius-sm)] border p-3 text-left transition-all min-h-[72px] cursor-pointer ${
                    on
                      ? "border-[#ffffff] bg-[#ffffff]/10 text-[#ffffff]"
                      : "border-[#262626] bg-[#000000] text-[#a1a1a1] hover:border-[#404040] hover:text-[#ffffff]"
                  }`}
                >
                  <Icon size={18} strokeWidth={1.5} aria-hidden="true" className={on ? "text-[#ffffff]" : ""} />
                  <span className="text-[length:var(--p-text-sm)] font-medium">{s.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[length:var(--p-text-xs)] text-[#737373] min-h-8">{activeSource.hint}</p>

          <div className="mt-[var(--p-space-md)] border-t border-[#262626] pt-[var(--p-space-md)]">
            <p className="mono text-[length:var(--p-text-label)] uppercase tracking-[0.16em] text-[#737373]">
              3 · Parameters applied to all
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {PARAMETERS.map((p) => (
                <span
                  key={p.key}
                  title={p.example}
                  className="mono rounded-full border border-[#262626] bg-[#000000] px-2.5 py-1 text-[length:var(--p-text-label)] text-[#a1a1a1]"
                >
                  {p.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Output multi-select ── */}
        <div className="p-card p-[var(--p-space-md)]">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="mono text-[length:var(--p-text-label)] uppercase tracking-[0.16em] text-[#737373]">
              2 · Outputs — select as many as you need
            </p>
            <span
              className="mono rounded-full bg-[#ffffff]/12 px-2.5 py-1 text-[length:var(--p-text-label)] font-semibold text-[#ffffff]"
              aria-live="polite"
            >
              {count} selected
            </span>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {OUTPUTS.map((o) => {
              const on = picked.has(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id)}
                  aria-pressed={on}
                  className={`group flex items-start gap-2.5 rounded-[var(--p-radius-sm)] border p-3 text-left transition-all min-h-11 cursor-pointer ${
                    on
                      ? "border-[#ffffff] bg-[#ffffff]/10"
                      : "border-[#262626] bg-[#000000] hover:border-[#404040]"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors ${
                      on ? "border-[#ffffff] bg-[#ffffff] text-[#000000]" : "border-[#404040]"
                    }`}
                  >
                    {on && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className={`text-[length:var(--p-text-sm)] font-medium ${on ? "text-[#ffffff]" : "text-[#a1a1a1]"}`}>
                    {o.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-[var(--p-space-md)] rounded-[var(--p-radius-sm)] border border-dashed border-[#262626] bg-[#000000] p-3">
            <p className="mono text-[length:var(--p-text-label)] uppercase tracking-[0.16em] text-[#737373]">This run would produce</p>
            <div className="mt-2 flex flex-wrap gap-1.5 min-h-8">
              <AnimatePresence mode="popLayout" initial={false}>
                {count === 0 ? (
                  <motion.span
                    key="empty"
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-[length:var(--p-text-xs)] text-[#737373]"
                  >
                    Select at least one output above.
                  </motion.span>
                ) : (
                  OUTPUTS.filter((o) => picked.has(o.id)).map((o) => (
                    <motion.span
                      key={o.id}
                      layout={!reduce}
                      initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reduce ? undefined : { opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.15 }}
                      className="mono rounded-full bg-[#0b0b0b] border border-[#ffffff]/40 px-2.5 py-1 text-[length:var(--p-text-label)] text-[#ffffff]"
                    >
                      {o.label}
                    </motion.span>
                  ))
                )}
              </AnimatePresence>
            </div>
            <p className="mt-2.5 text-[length:var(--p-text-xs)] text-[#737373]">
              All {count === 1 ? "of it" : count > 1 ? `${count} deliverables` : "selections"} generated in one
              run, from one reading of the source.
            </p>
          </div>

          <Link to="/transform" className="p-btn p-btn-primary mt-[var(--p-space-md)] w-full">
            Run this in the console
          </Link>
        </div>
      </motion.div>
    </motion.section>
  );
}
