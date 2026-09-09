import { Eyebrow, HudBrackets } from "./bits";

/** Anchor target for the "Case Studies" nav link and the hero's
 * [ VIEW CASE STUDIES ] CTA. The mockup has no case-studies content, and the
 * previous landing page deliberately refused to invent any — that honest
 * stance is kept, restyled for the HUD system. */
export function CaseStudiesStrip() {
  return (
    <section id="case-studies" className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 pt-24 scroll-mt-24">
      <div className="bg-hud-surface p-8 rounded relative shadow-[0_0_12px_rgba(0,0,0,0.4)]">
        <HudBrackets />
        <span className="mb-2 block">
          <Eyebrow>[ FIELD RESULTS // PENDING ]</Eyebrow>
        </span>
        <h2 className="font-display text-2xl font-semibold text-slate-100 mb-2">
          Case studies are in development.
        </h2>
        <p className="font-mono text-[13px] text-slate-400 max-w-2xl leading-relaxed">
          There are no case studies here yet, and we would rather show none than invent them. They
          will be added as the platform is used in the field and the teams involved are able to
          share results.
        </p>
      </div>
    </section>
  );
}
