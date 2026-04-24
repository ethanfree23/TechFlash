import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TECHFLASH_LOGO_NAV } from '../constants/branding';
import { FaBolt, FaHandshake, FaShieldAlt } from 'react-icons/fa';
import RegisterForm from '../components/RegisterForm';
import { marketingLeadsAPI } from '../api/api';

const MarketingPage = ({ onLoginSuccess }) => {
  const navigate = useNavigate();
  const [roleView, setRoleView] = useState('technician');
  const [leadEmail, setLeadEmail] = useState('');
  const [submittingLead, setSubmittingLead] = useState(false);
  const [leadError, setLeadError] = useState('');

  const stepsByRole = useMemo(
    () => ({
      technician: [
        'Sign up and fill out your information.',
        'Turn on alerts for jobs that match your qualifications and distance from home.',
        'Claim a job that works for you.',
        'Start the job and earn money.',
      ],
      company: [
        'Sign up.',
        'Post a job.',
        'Expect it filled within 6 hours.',
        'Get the job done faster.',
      ],
    }),
    []
  );

  const handleLeadSubmit = async (e) => {
    e.preventDefault();
    setLeadError('');
    setSubmittingLead(true);
    try {
      await marketingLeadsAPI.create({
        email: leadEmail.trim(),
        role_view: roleView,
        source: 'landing_get_started',
      });
      const query = new URLSearchParams({
        tab: 'signup',
        email: leadEmail.trim(),
        role: roleView,
      });
      navigate(`/login?${query.toString()}`);
    } catch (err) {
      setLeadError(err.message || 'Could not save your email. Please try again.');
    } finally {
      setSubmittingLead(false);
    }
  };

  return (
    <div
      className="min-h-screen text-gray-800"
      style={{
        background:
          'linear-gradient(135deg, #F7F7F7 0%, #F7F7F7 25%, rgba(254, 103, 17, 0.08) 50%, rgba(254, 103, 17, 0.2) 75%, rgba(254, 103, 17, 0.35) 100%)',
      }}
    >
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-orange-100/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center gap-2 group">
              <img src={TECHFLASH_LOGO_NAV} alt="TechFlash" className="h-9 group-hover:scale-105 transition-transform" />
              <span className="text-xl font-bold text-gray-800 tracking-tight">TechFlash</span>
            </Link>
            <div className="flex items-center gap-2">
              <Link to="/login" className="px-4 py-2.5 text-sm font-semibold text-gray-700 hover:text-[#FE6711] transition rounded-full hover:bg-orange-50">Login</Link>
              <Link to="/login?tab=signup" className="px-5 py-2.5 text-sm font-semibold bg-[#FE6711] text-white rounded-full hover:bg-[#e55a0a] transition">Sign up</Link>
            </div>
          </div>
        </div>
      </header>

      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="max-w-5xl mx-auto text-center relative">
          <div className="inline-block px-4 py-2 mb-6 rounded-full bg-[#FE6711]/15 text-[#FE6711] font-semibold text-sm">
            Find short-term technicians in under 6 hours
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black tracking-tight text-gray-800 leading-tight">
            Fast field-service staffing for both sides.
          </h1>
          <p className="mt-6 text-xl text-gray-600 max-w-2xl mx-auto">
            Companies fill urgent jobs quickly. Technicians claim nearby work and get paid. TechFlash keeps both sides moving.
          </p>
        </div>
      </section>

      <section className="px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto rounded-2xl border border-orange-100 bg-white/90 p-5 shadow-sm">
          <form onSubmit={handleLeadSubmit} className="flex flex-col gap-3 md:flex-row md:items-center">
            <p className="text-sm font-semibold text-gray-700 md:w-56">Get started in seconds</p>
            <input
              type="email"
              required
              value={leadEmail}
              onChange={(e) => setLeadEmail(e.target.value)}
              placeholder="Enter your email"
              className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-[#FE6711] focus:outline-none"
            />
            <button type="submit" disabled={submittingLead} className="rounded-xl bg-[#FE6711] px-5 py-3 text-sm font-semibold text-white hover:bg-[#e55a0a] disabled:opacity-50">
              {submittingLead ? 'Submitting...' : 'Submit'}
            </button>
          </form>
          {leadError && <p className="mt-2 text-sm text-red-600">{leadError}</p>}
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-black text-gray-800">How it works</h2>
          <div className="mt-8 flex items-center justify-center gap-3">
            <button type="button" onClick={() => setRoleView('technician')} className={`rounded-full px-4 py-2 text-sm font-semibold ${roleView === 'technician' ? 'bg-[#FE6711] text-white' : 'bg-white text-gray-700 border border-gray-200'}`}>For Techs</button>
            <button type="button" onClick={() => setRoleView('company')} className={`rounded-full px-4 py-2 text-sm font-semibold ${roleView === 'company' ? 'bg-[#FE6711] text-white' : 'bg-white text-gray-700 border border-gray-200'}`}>For Companies</button>
          </div>
          <div className="mt-5 rounded-2xl border border-orange-100 bg-white p-6">
            <ol className="space-y-3">
              {stepsByRole[roleView].map((stepText, index) => (
                <li key={stepText} className="text-gray-700">
                  <span className="mr-2 font-semibold text-[#FE6711]">Step {index + 1}.</span>
                  {stepText}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-4xl font-black text-center text-gray-800 mb-14">
            Why TechFlash
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { icon: FaBolt, title: 'Fast matches', desc: 'Jobs get filled quickly. Technicians find work that fits.' },
              { icon: FaShieldAlt, title: 'Trusted platform', desc: 'Secure payments, ratings, and verified profiles.' },
              { icon: FaHandshake, title: 'Simple workflow', desc: 'From posting to payout-everything in one place.' },
            ].map(({ icon: Icon, title, desc }, i) => (
              <div key={i} className="text-center">
                <div className="inline-flex p-5 rounded-2xl bg-white/90 border-2 border-orange-100 shadow-lg mb-5">
                  <Icon className="w-10 h-10 text-[#FE6711]" />
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">{title}</h3>
                <p className="text-gray-600 text-sm">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 px-4 sm:px-6 lg:px-8 relative" id="signup">
        <div className="absolute inset-0 bg-[#FE6711]/10 rounded-[3rem] mx-4 sm:mx-8" />
        <div className="max-w-lg mx-auto relative">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-4xl font-black text-gray-800 mb-4">Ready to get started?</h2>
          </div>
          <div className="rounded-3xl bg-white/95 border-2 border-orange-100 shadow-xl shadow-orange-100/40 p-8 sm:p-10 backdrop-blur-sm">
            <RegisterForm onLoginSuccess={onLoginSuccess} variant="marketing" idPrefix="marketing-signup" initialRole={roleView} initialRoleView={roleView} />
          </div>
        </div>
      </section>
    </div>
  );
};

export default MarketingPage;
