import { motion } from "framer-motion";
import { useRevealSafe } from "./useRevealSafe";
import { ArrowRight } from "lucide-react";
import { USE_CASES } from "./data";
import ScrollReveal from "./ScrollReveal";

/** Four equally-weighted examples. Security/threat-intel appears as one card
 * among four, not as the product's identity. */
export function UseCases() {
  const { props: revealProps, container, item } = useRevealSafe();

  return (
    <section id="use-cases" className="mx-auto max-w-7xl px-4 sm:px-6 py-[var(--p-space-2xl)] scroll-mt-20">
      <div className="max-w-2xl">
        <span className="mono text-[length:var(--p-text-xs)] uppercase tracking-[0.18em] text-[#a1a1a1]">Use cases</span>
        <h2 className="mt-3 font-semibold tracking-tight" style={{ fontSize: "var(--p-text-2xl)", lineHeight: 1.15 }}>
          The same engine, whatever you work on.
        </h2>
        <ScrollReveal
          baseOpacity={0}
          enableBlur={true}
          baseRotation={5}
          blurStrength={10}
          containerClassName="!mt-3 !mb-0"
          textClassName="!text-[length:var(--p-text-base)] !font-normal !leading-relaxed text-[#a1a1a1]"
        >
          {"Prisma is general-purpose. These are four examples, not the boundaries."}
        </ScrollReveal>
      </div>

      <motion.div
        {...revealProps}
        variants={container}
        className="mt-[var(--p-space-lg)] grid gap-3 sm:grid-cols-2"
      >
        {USE_CASES.map((u) => (
          <motion.article
            key={u.from}
            variants={item}
            className="p-card p-[var(--p-space-md)]"
          >
            <div className="mono flex flex-wrap items-center gap-2 text-[length:var(--p-text-xs)]">
              <span className="rounded-full border border-[#262626] bg-[#000000] px-2.5 py-1 text-[#d4d4d4]">
                {u.from}
              </span>
              <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" className="text-[#737373]" />
              <span className="rounded-full border border-[#ffffff]/40 bg-[#ffffff]/10 px-2.5 py-1 text-[#ffffff]">
                {u.to}
              </span>
            </div>
            <p className="mt-3 text-[length:var(--p-text-sm)] text-[#a1a1a1]">{u.body}</p>
          </motion.article>
        ))}
      </motion.div>
    </section>
  );
}
