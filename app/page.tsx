import { Navigation }          from "@/components/landing/navigation";
import { HeroSection }         from "@/components/landing/hero-section";
import { HowItWorksSection }   from "@/components/landing/how-it-works-section";
import { FeaturesSection }     from "@/components/landing/features-section";
import { MetricsSection }      from "@/components/landing/metrics-section";
import { InfrastructureSection } from "@/components/landing/infrastructure-section";
import { CtaSection }          from "@/components/landing/cta-section";
import { FooterSection }       from "@/components/landing/footer-section";

export default function Home() {
  return (
    <main className="nexus relative min-h-screen overflow-x-hidden">
      <Navigation />
      <HeroSection />
      <HowItWorksSection />
      <FeaturesSection />
      <MetricsSection />
      <InfrastructureSection />
      <CtaSection />
      <FooterSection />
    </main>
  );
}
