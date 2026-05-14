import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { marketingLeadsAPI } from '../api/api';
import { InstallAppPrompt } from '../components/InstallAppPrompt';
import { AudienceSplit } from '../components/marketing/AudienceSplit';
import { ClosingCtaBanner } from '../components/marketing/ClosingCtaBanner';
import { HeroSection } from '../components/marketing/HeroSection';
import { HowItWorksHomeTeaser } from '../components/marketing/HowItWorksHomeTeaser';
import { IndustryChips } from '../components/marketing/IndustryChips';
import { MarketingHeader } from '../components/marketing/MarketingHeader';
import { SignupCtaPanel } from '../components/marketing/SignupCtaPanel';
import { TrustFooterStrip } from '../components/marketing/TrustFooterStrip';
import { WhyTechFlashHomeTeaser } from '../components/marketing/WhyTechFlashHomeTeaser';
import { goCompanyPostJob } from '../utils/companyJobPostNavigate';
import { goTechnicianFindWork } from '../utils/technicianMarketingNavigate';
import { readSignupRoleIntent, writeSignupRoleIntent } from '../utils/signupRoleIntent';

/**
 * Public marketing home. Email capture uses `readSignupRoleIntent()` / `writeSignupRoleIntent()` — see
 * `src/utils/signupRoleIntent.js` (no visible role toggle; generic email defaults to technician).
 */
const MarketingPage = () => {
  const navigate = useNavigate();
  const [signupEmail, setSignupEmail] = useState('');
  const [submittingLead, setSubmittingLead] = useState(false);
  const [leadError, setLeadError] = useState('');

  const goSignupDirect = useCallback(
    (role) => {
      writeSignupRoleIntent(role);
      navigate(`/login?tab=signup&role=${role}`);
    },
    [navigate]
  );

  const submitLead = useCallback(
    async (email) => {
      setLeadError('');
      setSubmittingLead(true);
      try {
        const trimmedEmail = email.trim();
        const role = readSignupRoleIntent();
        await marketingLeadsAPI.create({
          email: trimmedEmail,
          role_view: role,
          source: 'landing_get_started',
        });
        const query = new URLSearchParams({
          tab: 'signup',
          email: trimmedEmail,
          role,
        });
        navigate(`/login?${query.toString()}`);
      } catch (err) {
        setLeadError(err.message || 'Could not save your email. Please try again.');
      } finally {
        setSubmittingLead(false);
      }
    },
    [navigate]
  );

  const handleSignupEmailSubmit = (e) => {
    e.preventDefault();
    void submitLead(signupEmail);
  };

  return (
    <div className="min-h-screen min-w-0 bg-tf-muted text-gray-800">
      <div
        className="min-h-screen"
        style={{
          background:
            'linear-gradient(180deg, #ffffff 0%, #F7F7F7 18%, #F7F7F7 60%, rgba(254, 103, 17, 0.06) 100%)',
        }}
      >
        <MarketingHeader />

        <HeroSection onPostJob={() => goCompanyPostJob(navigate)} onFindWork={() => goTechnicianFindWork(navigate)} />

        <IndustryChips />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <InstallAppPrompt />
        </div>

        <WhyTechFlashHomeTeaser />

        <AudienceSplit />

        <HowItWorksHomeTeaser />

        <SignupCtaPanel
          signupEmail={signupEmail}
          onSignupEmailChange={setSignupEmail}
          onSubmitEmail={handleSignupEmailSubmit}
          onContinueAsCompany={() => goSignupDirect('company')}
          onContinueAsTechnician={() => goSignupDirect('technician')}
          submittingLead={submittingLead}
          leadError={leadError}
        />

        <ClosingCtaBanner onJoin={() => goSignupDirect(readSignupRoleIntent())} />

        <TrustFooterStrip />
      </div>
    </div>
  );
};

export default MarketingPage;
