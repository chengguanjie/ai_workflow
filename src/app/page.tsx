import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import {
  CTASection,
  FeaturesSection,
  HeroSection,
  LandingFooter,
  LandingHeader,
  StatsSection,
  TestimonialsSection,
  UseCasesSection,
} from '@/components/landing'

export default async function Home() {
  const session = await auth()

  if (session) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-background">
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
  )
}
