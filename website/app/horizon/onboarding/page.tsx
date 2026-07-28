'use client';

import HorizonGate from '../../../components/horizon/HorizonGate';
import OnboardingWizard from '../../../components/horizon/OnboardingWizard';

export default function HorizonOnboardingPage() {
  return <HorizonGate>{({ userId }) => <OnboardingWizard userId={userId} />}</HorizonGate>;
}
