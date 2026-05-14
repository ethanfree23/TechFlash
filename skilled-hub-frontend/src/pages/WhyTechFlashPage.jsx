import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MarketingHeader } from '../components/marketing/MarketingHeader';
import { CompanyBenefitsSection } from '../components/marketing/whyTechFlash/CompanyBenefitsSection';
import { CoreValueStrip } from '../components/marketing/whyTechFlash/CoreValueStrip';
import { DifferentiatorsSection } from '../components/marketing/whyTechFlash/DifferentiatorsSection';
import { MarketplaceFlywheel } from '../components/marketing/whyTechFlash/MarketplaceFlywheel';
import { OldWayVsTechFlashSection } from '../components/marketing/whyTechFlash/OldWayVsTechFlashSection';
import { TechnicianBenefitsSection } from '../components/marketing/whyTechFlash/TechnicianBenefitsSection';
import { TrustSection } from '../components/marketing/whyTechFlash/TrustSection';
import { WhyExistsSection } from '../components/marketing/whyTechFlash/WhyExistsSection';
import { WhyTechFlashCTA } from '../components/marketing/whyTechFlash/WhyTechFlashCTA';
import { WhyTechFlashFAQ } from '../components/marketing/whyTechFlash/WhyTechFlashFAQ';
import { WhyTechFlashHero } from '../components/marketing/whyTechFlash/WhyTechFlashHero';
import { WhyTechFlashTrustFooter } from '../components/marketing/whyTechFlash/WhyTechFlashTrustFooter';
import { goCompanyPostJob } from '../utils/companyJobPostNavigate';
import { goTechnicianFindWork } from '../utils/technicianMarketingNavigate';

/**
 * Public “Why TechFlash” marketing page. Role intent for signup is driven by CTAs that call
 * `goCompanyPostJob` / `goTechnicianFindWork` (session helpers). A plain Link to `/login?tab=signup`
 * does not clear `signupRoleIntent` — see `src/utils/signupRoleIntent.js`.
 */
const WhyTechFlashPage = () => {
  const navigate = useNavigate();

  const scrollToWhyExists = useCallback(() => {
    document.getElementById('why-exists')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div className="min-h-screen min-w-0 bg-white text-gray-800">
      <MarketingHeader />
      <WhyTechFlashHero onSeeWhyItWorks={scrollToWhyExists} />
      <CoreValueStrip />
      <WhyExistsSection />
      <OldWayVsTechFlashSection />
      <CompanyBenefitsSection />
      <TechnicianBenefitsSection />
      <DifferentiatorsSection />
      <TrustSection />
      <MarketplaceFlywheel />
      <WhyTechFlashFAQ />
      <WhyTechFlashCTA onPostJob={() => goCompanyPostJob(navigate)} onFindWork={() => goTechnicianFindWork(navigate)} />
      <WhyTechFlashTrustFooter />
    </div>
  );
};

export default WhyTechFlashPage;
