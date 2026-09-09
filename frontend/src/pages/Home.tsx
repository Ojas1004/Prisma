import { useEffect, useState } from "react";
import { SECTION_IDS } from "@/App";
import type { SectionId } from "@/App";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { TelemetryStrip } from "@/components/landing/TelemetryStrip";
import { HeroSection } from "@/components/landing/HeroSection";
import { StudioMatrixSection } from "@/components/landing/StudioMatrixSection";
import { PipelineSection } from "@/components/landing/PipelineSection";
import { DifferentiatorsSection } from "@/components/landing/DifferentiatorsSection";
import { CaseStudiesStrip } from "@/components/landing/CaseStudiesStrip";
import { CTADock } from "@/components/landing/CTADock";
import { LandingFooter } from "@/components/landing/LandingFooter";
import "@/styles/hud.css";

/** Tracks which anchor section is in view so the header nav reflects scroll
 * position, not just the last click. Measures a line near the top of the
 * viewport rather than a centre band: an anchor parks its section just under
 * the fixed nav, so a short section can sit entirely above a centre band and
 * the following one would light up instead. */
function useScrollSpy(): SectionId | null {
  const [active, setActive] = useState<SectionId | null>(null);

  useEffect(() => {
    const sections = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0) return;

    const pick = () => {
      if (window.scrollY < 40) {
        setActive(null);
        return;
      }
      const line = window.innerHeight * 0.25;
      let current: SectionId | null = null;
      for (const el of sections) {
        const { top, bottom } = el.getBoundingClientRect();
        if (top <= line && bottom > line) {
          current = el.id as SectionId;
          break;
        }
        if (bottom <= line) current = el.id as SectionId;
      }
      setActive(current);
    };

    const observer = new IntersectionObserver(pick, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    sections.forEach((el) => observer.observe(el));
    window.addEventListener("scroll", pick, { passive: true });
    window.addEventListener("resize", pick);
    pick();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", pick);
      window.removeEventListener("resize", pick);
    };
  }, []);

  return active;
}

/** Landing page — the Transform Console HUD marketing page (Stitch mockup
 * port). All interactivity here is landing-page simulation; the real
 * pipeline lives behind /transform. */
export default function Home() {
  const activeSection = useScrollSpy();

  return (
    <div className="min-h-screen w-full bg-hud-black bg-hud-grid text-slate-100 font-mono overflow-x-hidden">
      <LandingHeader activeSection={activeSection} />
      <main className="w-full pt-16">
        <TelemetryStrip />
        <HeroSection />
        <StudioMatrixSection />
        <PipelineSection />
        <DifferentiatorsSection />
        <CaseStudiesStrip />
        <CTADock />
      </main>
      <LandingFooter />
    </div>
  );
}
