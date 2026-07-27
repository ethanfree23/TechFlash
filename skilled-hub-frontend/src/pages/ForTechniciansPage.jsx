import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import MarketingPageLayout from '../components/layout/MarketingPageLayout';
import { TechnicianBenefitCards } from '../components/marketing/technicians/TechnicianBenefitCards';
import { TechnicianCTA } from '../components/marketing/technicians/TechnicianCTA';
import { TechnicianProblemSolution } from '../components/marketing/technicians/TechnicianProblemSolution';
import { TechnicianValueStrip } from '../components/marketing/technicians/TechnicianValueStrip';
import { TechnicianWorkflow } from '../components/marketing/technicians/TechnicianWorkflow';
import { TechniciansHero } from '../components/marketing/technicians/TechniciansHero';
import { goTechnicianFindWork, goTechnicianProfileOrSignup } from '../utils/technicianMarketingNavigate';

/**
 * Public technician marketing page. All primary CTAs call `goTechnicianFindWork` /
 * `goTechnicianProfileOrSignup`, which set `writeSignupRoleIntent('technician')` so any downstream
 * email capture (e.g. main landing) defaults to technician unless the user hits a company CTA first.
 * There is no visible role toggle on this page.
 */
const ForTechniciansPage = () => {
  const navigate = useNavigate();

  const scrollToWorkflow = useCallback(() => {
    document.getElementById('technician-workflow')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleFindWork = useCallback(() => {
    goTechnicianFindWork(navigate);
  }, [navigate]);

  const handleCreateProfile = useCallback(() => {
    goTechnicianProfileOrSignup(navigate);
  }, [navigate]);

  return (
    <MarketingPageLayout footerVariant="technicians">
      <TechniciansHero onFindWork={handleFindWork} onSeeHowItWorks={scrollToWorkflow} />
      <TechnicianValueStrip />
      <TechnicianBenefitCards />
      <TechnicianProblemSolution />
      <TechnicianWorkflow />
      <TechnicianCTA onFindWork={handleFindWork} onCreateProfile={handleCreateProfile} />
    </MarketingPageLayout>
  );
};

export default ForTechniciansPage;
