import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useRevealSafe } from "./useRevealSafe";

export function ClosingCTA() {
  const { props: reveal, container, item } = useRevealSafe();

  return (
    <motion.section
      {...reveal}
      variants={container}
      className="mx-auto max-w-7xl px-4 sm:px-6 pb-[var(--p-space-2xl)]"
    >
      <motion.div variants={item} className="p-card p-mesh p-[var(--p-space-xl)] text-center">
        <h2 className="font-semibold tracking-tight text-balance" style={{ fontSize: "var(--p-text-xl)", lineHeight: 1.2 }}>
          Bring a document. Leave with everything you need to publish.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[#a1a1a1]">
          Sign in and run your first transformation in the console.
        </p>
        <div className="mt-[var(--p-space-lg)] flex flex-wrap items-center justify-center gap-3">
          <Link to="/transform" className="p-btn p-btn-primary">
            Launch console
            <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
          </Link>
          <Link
            to="/auth"
            className="text-[length:var(--p-text-sm)] text-[#a1a1a1] underline underline-offset-4 decoration-[#404040] hover:text-[#ffffff] hover:decoration-[#ffffff] transition-colors duration-[var(--p-dur-fast)]"
          >
            Create an account
          </Link>
        </div>
      </motion.div>
    </motion.section>
  );
}
