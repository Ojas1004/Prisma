import { Header } from "@/components/landing2/Header";
import { PrismBackdrop } from "@/components/landing2/PrismBackdrop";
import { Hero } from "@/components/landing2/Hero";
import { SelectorDemo } from "@/components/landing2/SelectorDemo";
import { FormatsBento } from "@/components/landing2/FormatsBento";
import { HowItWorks } from "@/components/landing2/HowItWorks";
import { UseCases } from "@/components/landing2/UseCases";
import { ClosingCTA } from "@/components/landing2/ClosingCTA";
import { Footer } from "@/components/landing2/Footer";

/** Prisma landing page.
 *
 * Structure follows the ai-driven-dynamic-landing pattern from ui-ux-pro-max
 * (input hero -> result preview -> how it works -> value prop), with the
 * "generated result preview" implemented as an honest interactive selector
 * rather than fabricated output. */
export default function Home() {
  return (
    <div className="prisma relative min-h-screen w-full overflow-x-hidden">
      <PrismBackdrop />
      <Header />
      <main className="relative z-10">
        <Hero />
        <SelectorDemo />
        <FormatsBento />
        <HowItWorks />
        <UseCases />
        <ClosingCTA />
      </main>
      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}
