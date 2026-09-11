import { motion } from "framer-motion";
import { useRevealSafe } from "./useRevealSafe";
import { STEPS, PARAMETERS } from "./data";

export function HowItWorks() {
  const { props: revealProps, container, item } = useRevealSafe();

  return (
    <section id="how" className="border-y border-[#262626] bg-[#070707]/80 scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-[var(--p-space-2xl)]">
        <div className="max-w-2xl">
          <span className="mono text-[length:var(--p-text-xs)] uppercase tracking-[0.18em] text-[#a1a1a1]">How it works</span>
          <h2 className="mt-3 font-semibold tracking-tight" style={{ fontSize: "var(--p-text-2xl)", lineHeight: 1.15 }}>
            Four steps, one pass.
          </h2>
        </div>

        <motion.ol
        {...revealProps}
        variants={container}
          className="mt-[var(--p-space-lg)] grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {STEPS.map((s) => (
            <motion.li
              key={s.n}
              variants={item}
              className="p-card p-[var(--p-space-md)]"
            >
              <span className="mono text-[length:var(--p-text-xs)] font-bold text-[#737373]">{s.n}</span>
              <h3 className="mt-2 font-semibold text-[#ffffff]">{s.title}</h3>
              <p className="mt-1.5 text-[length:var(--p-text-sm)] text-[#a1a1a1]">{s.body}</p>
            </motion.li>
          ))}
        </motion.ol>

        {/* Parameters detail */}
        <div className="mt-[var(--p-space-xl)]">
          <h3 className="font-semibold text-[#ffffff]" style={{ fontSize: "var(--p-text-lg)" }}>
            Six parameters, applied across every selected format
          </h3>
          <div className="mt-[var(--p-space-md)] grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PARAMETERS.map((p) => (
              <div key={p.key} className="rounded-[var(--p-radius-sm)] border border-[#262626] bg-[#0b0b0b] p-3.5">
                <p className="mono text-[length:var(--p-text-xs)] font-semibold uppercase tracking-[0.14em] text-[#ffffff]">{p.label}</p>
                <p className="mt-1.5 text-[length:var(--p-text-sm)] text-[#a1a1a1]">{p.example}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
