import { motion } from "framer-motion";
import { useRevealSafe } from "./useRevealSafe";
import { OUTPUTS } from "./data";
import ScrollReveal from "./ScrollReveal";

/** Output formats in a bento grid (ui-ux-pro-max: bento-box-grid) with a
 * staggered scroll reveal (modern-web-design Pattern 7). The first two cards
 * span wider so the grid is asymmetric rather than a uniform 7-up. */
const SPAN: Record<string, string> = {
  video: "sm:col-span-2",
  linkedin_post: "",
  twitter_post: "",
  advisory: "",
  executive_summary: "sm:col-span-2",
  presentation: "",
  infographic: "",
};

export function FormatsBento() {
  const { props: revealProps, container, item } = useRevealSafe();

  return (
    <section id="formats" className="mx-auto max-w-7xl px-4 sm:px-6 py-[var(--p-space-2xl)] scroll-mt-20">
      <div className="max-w-2xl">
        <span className="mono text-[length:var(--p-text-xs)] uppercase tracking-[0.18em] text-[#a1a1a1]">Output formats</span>
        <h2 className="mt-3 font-semibold tracking-tight" style={{ fontSize: "var(--p-text-2xl)", lineHeight: 1.15 }}>
          Seven deliverables, each written for its own audience.
        </h2>
        <ScrollReveal
          baseOpacity={0}
          enableBlur={true}
          baseRotation={5}
          blurStrength={10}
          containerClassName="!mt-3 !mb-0"
          textClassName="!text-[length:var(--p-text-base)] !font-normal !leading-relaxed text-[#a1a1a1]"
        >
          {"A summary for a board and a post for a feed are different jobs. Prisma writes each one to its own conventions instead of reformatting a single draft."}
        </ScrollReveal>
      </div>

      <motion.div
        {...revealProps}
        variants={container}
        className="mt-[var(--p-space-lg)] grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {OUTPUTS.map((o) => (
          <motion.article
            key={o.id}
            variants={item}
            className={`p-card p-[var(--p-space-md)] flex flex-col gap-2 ${SPAN[o.id] ?? ""}`}
          >
            <h3 className="font-semibold text-[#ffffff]" style={{ fontSize: "var(--p-text-lg)" }}>
              {o.label}
            </h3>
            <p className="text-[length:var(--p-text-sm)] text-[#a1a1a1]">{o.blurb}</p>
          </motion.article>
        ))}
      </motion.div>
    </section>
  );
}
