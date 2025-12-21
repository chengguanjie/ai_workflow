"use client";

import {
  LandingHeader,
  LandingFooter,
  HeroSection,
  FeaturesSection,
  UseCasesSection,
  TestimonialsSection,
  CTASection,
  StatsSection,
} from "@/components/landing";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <LandingHeader />
      <main>
        <HeroSection />
        <StatsSection />
        <FeaturesSection />
        <UseCasesSection />
        <TestimonialsSection />
        <CTASection />
      </main>
      <LandingFooter />
    </div>
  );
}
