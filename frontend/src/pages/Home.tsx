import { HeroSection } from "@/components/ui/galaxy-interactive-hero-section";

/** Landing page — the galaxy interactive hero. The page owns no styling of
 * its own: the hero component is Tailwind-styled throughout, so there is no
 * page-level stylesheet to import. */
export default function Home() {
  return (
    <main className="bg-black relative min-h-screen w-full overflow-x-hidden">
      <HeroSection />
    </main>
  );
}
