import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";

/** Hero. Staggered reveal follows modern-web-design Pattern 7 (Framer Motion
 * variants + whileInView), with motion skipped under prefers-reduced-motion. */
export function Hero() {
  const reduce = useReducedMotion();

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.09, delayChildren: 0.05 } },
  };
  // Transform-only: opacity stays 1 so the headline is readable even before
  // the animation runs. Motion enhances, it never gates content.
  const item = {
    hidden: reduce ? {} : { y: 18 },
    show: { y: 0, transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] as const } },
  };

  return (
    <section className="relative p-mesh">
      <div className="absolute inset-0 p-grid-bg pointer-events-none" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 pt-[calc(4rem+var(--p-space-2xl))] pb-[var(--p-space-2xl)]">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="max-w-5xl"
        >
          <motion.span
            variants={item}
            className="mono inline-flex items-center gap-2 rounded-full border border-[#262626] bg-[#0b0b0b] px-3 py-1.5 text-[length:var(--p-text-label)] uppercase tracking-[0.18em] text-[#ffffff]"
          >
            AI content transformation
          </motion.span>

          <motion.h1
            variants={item}
            className="mt-[var(--p-space-md)] max-w-none font-semibold tracking-tight text-balance lg:pr-8"
            style={{ fontSize: "var(--p-text-3xl)", lineHeight: 1.05 }}
          >
            Turn any source into{" "}
            <span className="text-[#a1a1a1]">every format</span>{" "}
            you need.
          </motion.h1>

          <motion.p
            variants={item}
            className="mt-[var(--p-space-md)] max-w-2xl text-[#a1a1a1]"
            style={{ fontSize: "var(--p-text-lg)" }}
          >
            Articles, reports, research papers, policy documents, images, or a free-form
            prompt. Select the outputs you want and generate them together from a single
            reading of the source.
          </motion.p>

          <motion.div variants={item} className="mt-[var(--p-space-lg)] flex flex-wrap items-center gap-3">
            <Link to="/transform" className="p-btn p-btn-primary">
              Launch console
              <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
            </Link>
            <a href="#formats" className="p-btn p-btn-ghost">
              See the formats
            </a>
          </motion.div>

          <motion.p variants={item} className="mono mt-[var(--p-space-md)] text-[length:var(--p-text-xs)] text-[#737373]">
            Seven output formats · six generation parameters · multi-select in one run
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
