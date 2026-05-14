import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MarketingHeader } from '../components/marketing/MarketingHeader';
import { HowItWorksCTA } from '../components/marketing/howItWorks/HowItWorksCTA';
import { HowItWorksFAQ } from '../components/marketing/howItWorks/HowItWorksFAQ';
import { HowItWorksHero } from '../components/marketing/howItWorks/HowItWorksHero';
import { HowItWorksTrustFooter } from '../components/marketing/howItWorks/HowItWorksTrustFooter';
import { MarketplaceTimeline } from '../components/marketing/howItWorks/MarketplaceTimeline';
import { ProcessSummaryStrip } from '../components/marketing/howItWorks/ProcessSummaryStrip';
import { ProductDetailSection } from '../components/marketing/howItWorks/ProductDetailSection';
import { TwoSidedFlow } from '../components/marketing/howItWorks/TwoSidedFlow';
import { WhyProcessWorks } from '../components/marketing/howItWorks/WhyProcessWorks';
import { goCompanyPostJob } from '../utils/companyJobPostNavigate';
import { goTechnicianFindWork } from '../utils/technicianMarketingNavigate';

/**
 * Canonical “how it works” marketing page. Role intent for signup is driven only by CTAs that call
 * `goCompanyPostJob` / `goTechnicianFindWork` (session helpers) — no email form or visible role toggle here.
 */
const HowItWorksPage = () => {
  const navigate = useNavigate();

  const scrollToTimeline = useCallback(() => {
    document.getElementById('marketplace-timeline')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div className="min-h-screen min-w-0 bg-white text-gray-800">
      <MarketingHeader />
      <HowItWorksHero onSeeProcess={scrollToTimeline} />
      <ProcessSummaryStrip />
      <MarketplaceTimeline />
      <TwoSidedFlow onPostJob={() => goCompanyPostJob(navigate)} onFindWork={() => goTechnicianFindWork(navigate)} />
      <ProductDetailSection />
      <WhyProcessWorks />
      <HowItWorksFAQ />
      <HowItWorksCTA onPostJob={() => goCompanyPostJob(navigate)} onFindWork={() => goTechnicianFindWork(navigate)} />
      <HowItWorksTrustFooter />
    </div>
  );
};

export default HowItWorksPage;
