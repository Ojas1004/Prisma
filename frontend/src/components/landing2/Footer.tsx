import { motion } from "framer-motion";
import { useRevealSafe } from "./useRevealSafe";

export function Footer() {
  const { props: reveal, container, item } = useRevealSafe();

  return (
    <motion.footer
      {...reveal}
      variants={container}
      className="border-t border-[#262626]"
    >
      <motion.div variants={item} className="mx-auto max-w-7xl px-4 sm:px-6 py-[var(--p-space-lg)] flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <img src="/assets/prisma-mark.webp" alt="" width={39} height={24} className="h-6 w-auto opacity-80" />
          <span className="mono text-[length:var(--p-text-xs)] tracking-[0.16em] text-[#a1a1a1]">PRISMA</span>
        </div>
        <p className="mono text-[length:var(--p-text-xs)] text-[#737373]">© 2026 Prisma. All rights reserved.</p>
      </motion.div>
    </motion.footer>
  );
}
