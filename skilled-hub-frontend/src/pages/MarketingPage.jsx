import React from 'react';
import { Link } from 'react-router-dom';
import { FaWrench, FaBuilding, FaBolt, FaHandshake, FaShieldAlt, FaCheckSquare } from 'react-icons/fa';
import RegisterForm from '../components/RegisterForm';

const MarketingPage = ({ onLoginSuccess }) => {
  return (
    <div 
      className="min-h-screen text-gray-800"
      style={{
        background: 'linear-gradient(135deg, #F7F7F7 0%, #F7F7F7 25%, rgba(254, 103, 17, 0.08) 50%, rgba(254, 103, 17, 0.2) 75%, rgba(254, 103, 17, 0.35) 100%)',
      }}
    >
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-orange-100/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center gap-2 group">
              <img src="/techflash-logo.png" alt="TechFlash" className="h-9 group-hover:scale-105 transition-transform" />
              <span className="text-xl font-bold text-gray-800 tracking-tight">TechFlash</span>
            </Link>
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="px-4 py-2.5 text-sm font-semibold text-gray-700 hover:text-[#FE6711] transition rounded-full hover:bg-orange-50"
              >
                Login
              </Link>
              <Link
                to="/login?tab=signup"
                className="px-5 py-2.5 text-sm font-semibold bg-[#FE6711] text-white rounded-full hover:bg-[#e55a0a] transition shadow-lg shadow-orange-200/50 hover:shadow-orange-300/50 hover:scale-105"
              >
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-28 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute top-20 right-10 w-72 h-72 bg-[#FE6711]/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-10 w-48 h-48 bg-[#FE6711]/15 rounded-full blur-3xl" />
        <div className="max-w-5xl mx-auto text-center relative">
          <div className="inline-block px-4 py-2 mb-6 rounded-full bg-[#FE6711]/15 text-[#FE6711] font-semibold text-sm">
            ✨ The future of field service
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black tracking-tight text-gray-800 leading-tight">
            Let&apos;s get the job done.
          </h1>
          <p className="mt-6 text-xl text-gray-600 max-w-2xl mx-auto">
            TechFlash connects skilled technicians with companies that need them. Post jobs, find talent, get work done—<span className="text-[#FE6711] font-semibold">fast.</span>
          </p>
          <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/login?tab=signup"
              className="inline-flex items-center justify-center px-8 py-4 text-base font-bold bg-[#FE6711] text-white rounded-2xl hover:bg-[#e55a0a] transition shadow-xl shadow-orange-200/40 hover:shadow-orange-300/50 hover:scale-105"
            >
              Get started — it&apos;s free
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold text-gray-700 bg-white/80 border-2 border-gray-200 rounded-2xl hover:border-[#FE6711] hover:text-[#FE6711] transition backdrop-blur"
            >
              I already have an account
            </Link>
          </div>
        </div>
      </section>

      {/* Features — Two audiences */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl sm:text-4xl font-black text-center text-gray-800 mb-4">
            Built for both sides
          </h2>
          <p className="text-center text-gray-500 mb-16 text-lg">of the marketplace</p>
          <div className="grid md:grid-cols-2 gap-8">
            {/* Companies */}
            <div className="group relative p-8 rounded-3xl bg-white/90 border-2 border-orange-100 shadow-xl shadow-orange-50/50 hover:shadow-2xl hover:shadow-orange-100/30 hover:border-[#FE6711]/30 transition-all duration-300 hover:-translate-y-1">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-4 rounded-2xl bg-[#FE6711]/20 group-hover:bg-[#FE6711]/30 transition">
                  <FaBuilding className="w-8 h-8 text-[#FE6711]" />
                </div>
                <h3 className="text-2xl font-bold text-gray-800">For Companies</h3>
              </div>
              <p className="text-gray-600 mb-6 leading-relaxed">
                Post field service jobs, browse vetted technicians, and fill your roster. Manage schedules, track progress, and get the skilled help you need—when you need it.
              </p>
              <ul className="space-y-4">
                {['Post and manage jobs in minutes', 'Browse technician profiles and ratings', 'Secure messaging and payments'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-gray-700">
                    <FaCheckSquare className="w-5 h-5 text-[#FE6711] flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Technicians */}
            <div className="group relative p-8 rounded-3xl bg-white/90 border-2 border-orange-100 shadow-xl shadow-orange-50/50 hover:shadow-2xl hover:shadow-orange-100/30 hover:border-[#FE6711]/30 transition-all duration-300 hover:-translate-y-1">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-4 rounded-2xl bg-[#FE6711]/20 group-hover:bg-[#FE6711]/30 transition">
                  <FaWrench className="w-8 h-8 text-[#FE6711]" />
                </div>
                <h3 className="text-2xl font-bold text-gray-800">For Technicians</h3>
              </div>
              <p className="text-gray-600 mb-6 leading-relaxed">
                Find field service jobs that match your skills. Claim work, show your expertise, and build your reputation. Get paid securely and grow your career.
              </p>
              <ul className="space-y-4">
                {['Discover jobs that fit your skills', 'Build your profile and ratings', 'Get paid securely when you complete work'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-gray-700">
                    <FaCheckSquare className="w-5 h-5 text-[#FE6711] flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Why TechFlash */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-4xl font-black text-center text-gray-800 mb-16">
            Why TechFlash
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { icon: FaBolt, title: 'Fast matches', desc: 'Jobs get filled quickly. Technicians find work that fits.' },
              { icon: FaShieldAlt, title: 'Trusted platform', desc: 'Secure payments, ratings, and verified profiles.' },
              { icon: FaHandshake, title: 'Simple workflow', desc: 'From posting to payout—everything in one place.' },
            ].map(({ icon: Icon, title, desc }, i) => (
              <div key={i} className="text-center group">
                <div className="inline-flex p-5 rounded-2xl bg-white/90 border-2 border-orange-100 shadow-lg mb-5 group-hover:scale-110 group-hover:border-[#FE6711]/40 transition-all">
                  <Icon className="w-10 h-10 text-[#FE6711]" />
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">{title}</h3>
                <p className="text-gray-600 text-sm">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sign up — inline form */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 relative" id="signup">
        <div className="absolute inset-0 bg-[#FE6711]/10 rounded-[3rem] mx-4 sm:mx-8" />
        <div className="max-w-lg mx-auto relative">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-4xl font-black text-gray-800 mb-4">
              Ready to get started?
            </h2>
            <p className="text-gray-600 text-lg">
              Join TechFlash today—fill in your details below. No extra clicks.
            </p>
          </div>
          <div className="rounded-3xl bg-white/95 border-2 border-orange-100 shadow-xl shadow-orange-100/40 p-8 sm:p-10 backdrop-blur-sm">
            <RegisterForm
              onLoginSuccess={onLoginSuccess}
              variant="marketing"
              idPrefix="marketing-signup"
            />
          </div>
          <p className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-[#FE6711] hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-4 border-t border-orange-200/50 bg-white/50">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <Link to="/" className="flex items-center gap-2 text-gray-600 hover:text-[#FE6711] transition">
            <img src="/techflash-logo.png" alt="TechFlash" className="h-6" />
            <span className="font-semibold">TechFlash</span>
          </Link>
          <div className="flex gap-8">
            <Link to="/login" className="text-sm font-medium text-gray-600 hover:text-[#FE6711] transition">Login</Link>
            <Link to="/login?tab=signup" className="text-sm font-medium text-gray-600 hover:text-[#FE6711] transition">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MarketingPage;
