'use client'

import dynamic from 'next/dynamic'

const OnboardingModal = dynamic(
  () => import('./OnboardingModal').then(m => ({ default: m.OnboardingModal })),
  { ssr: false }
)

export function OnboardingWrapper() {
  return <OnboardingModal />
}
