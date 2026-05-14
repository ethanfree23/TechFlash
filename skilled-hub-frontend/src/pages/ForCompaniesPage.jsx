import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CompaniesHero } from '../components/marketing/companies/CompaniesHero';
import { CompanyBenefitCards } from '../components/marketing/companies/CompanyBenefitCards';
import { CompanyCTA } from '../components/marketing/companies/CompanyCTA';
import { CompanyProblemSolution } from '../components/marketing/companies/CompanyProblemSolution';
import { CompanyStatsStrip } from '../components/marketing/companies/CompanyStatsStrip';
import { CompanyTrustFooter } from '../components/marketing/companies/CompanyTrustFooter';
import { CompanyWorkflow } from '../components/marketing/companies/CompanyWorkflow';
import { MarketingHeader } from '../components/marketing/MarketingHeader';
import { goCompanyPostJob } from '../utils/companyJobPostNavigate';

const ForCompaniesPage = () => {
  const navigate = useNavigate();

  const scrollToWorkflow = useCallback(() => {
    document.getElementById('company-workflow')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handlePostJob = useCallback(() => {
    goCompanyPostJob(navigate);
  }, [navigate]);

  return (
    <div className="min-h-screen min-w-0 bg-white text-gray-800">
      <MarketingHeader />
      <CompaniesHero onPostJob={handlePostJob} onSeeHowItWorks={scrollToWorkflow} />
      <CompanyStatsStrip />
      <CompanyBenefitCards />
      <CompanyProblemSolution />
      <CompanyWorkflow />
      <CompanyCTA onPostJobNow={handlePostJob} />
      <CompanyTrustFooter />
    </div>
  );
};

export default ForCompaniesPage;
