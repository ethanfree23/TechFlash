import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { TECHFLASH_LOGO_LOGIN } from '../constants/branding';
import { authAPI, passwordResetsAPI } from '../api/api';
import { auth } from '../auth';
import { setApiDemoMode, setDemoFlagshipJobId, setDemoReviewedJobId, isDemoMode } from '../utils/demoMode';
import { DEMO_ACCOUNTS } from '../constants/demoAccounts';
import RegisterForm from '../components/RegisterForm';
import { MarketingHeader } from '../components/marketing/MarketingHeader';
import { readSignupRoleIntent } from '../utils/signupRoleIntent';

const LoginPage = ({ onLoginSuccess }) => {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const signupEmail = searchParams.get('email') || '';
  /**
   * Role intent: explicit `?role=company|technician` wins; otherwise use session intent from
   * marketing CTAs (`readSignupRoleIntent()`); generic email signup defaults to technician.
   */
  const signupRoleView = useMemo(() => {
    const r = searchParams.get('role');
    if (r === 'company') return 'company';
    if (r === 'technician') return 'technician';
    return readSignupRoleIntent();
  }, [searchParams]);
  const [isLogin, setIsLogin] = useState(tab !== 'signup');

  useEffect(() => {
    if (tab === 'signup') setIsLogin(false);
    else if (tab === 'login') setIsLogin(true);
  }, [tab]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetNotice, setResetNotice] = useState('');

  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const navigate = useNavigate();
  const autoLoginAttempted = useRef(false);

  useEffect(() => {
    if (tab === 'signup') return;
    const demoParam = searchParams.get('demo');
    if (demoParam === 'admin' || demoParam === 'company' || demoParam === 'technician') {
      const account = DEMO_ACCOUNTS[demoParam];
      if (account) {
        setLoginData({ email: account.email, password: account.password });
      }
    } else if (isDemoMode() && !signupEmail) {
      setLoginData({
        email: DEMO_ACCOUNTS.admin.email,
        password: DEMO_ACCOUNTS.admin.password,
      });
    } else if (signupEmail) {
      setLoginData((prev) => ({ ...prev, email: signupEmail }));
    }
  }, [searchParams, tab, signupEmail]);

  const completeLogin = async (email, password) => {
    const response = await authAPI.login(email, password);
    auth.setToken(response.token);
    auth.setUser(response.user);
    if (response.demo_mode != null) setApiDemoMode(response.demo_mode);
    if (response.flagship_job_id) setDemoFlagshipJobId(response.flagship_job_id);
    if (response.reviewed_job_id) setDemoReviewedJobId(response.reviewed_job_id);
    onLoginSuccess(response.user);
    setTimeout(() => navigate('/dashboard'), 100);
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await completeLogin(loginData.email, loginData.password);
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = useCallback(async (role) => {
    const account = DEMO_ACCOUNTS[role];
    if (!account) return;
    setLoginData({ email: account.email, password: account.password });
    setLoading(true);
    setError('');
    try {
      await completeLogin(account.email, account.password);
    } catch (err) {
      console.error('Demo login error:', err);
      setError(err.message || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'signup') return;
    if (searchParams.get('auto') !== '1') return;
    if (autoLoginAttempted.current) return;
    const demoParam = searchParams.get('demo');
    if (demoParam && DEMO_ACCOUNTS[demoParam]) {
      autoLoginAttempted.current = true;
      handleDemoLogin(demoParam);
    }
  }, [searchParams, tab, handleDemoLogin]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setLoginData((prev) => ({ ...prev, [name]: value }));
  };

  const handleForgotPassword = async () => {
    const email = loginData.email?.trim();
    if (!email) {
      setError('Enter your email first, then click Forgot password.');
      return;
    }
    setResetLoading(true);
    setError('');
    setResetNotice('');
    try {
      await passwordResetsAPI.request(email);
      setResetNotice('If an account exists for that email, we sent a password reset link.');
    } catch (err) {
      setError(err.message || 'Could not start password reset');
    } finally {
      setResetLoading(false);
    }
  };

  if (!isLogin) {
    return (
      <div className="min-h-screen min-w-0 bg-tf-muted text-gray-800">
        <MarketingHeader />
        <div
          className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-tf-navy via-[#0f1f45] to-tf-muted pb-16 pt-2"
        >
          <RegisterForm
            onLoginSuccess={onLoginSuccess}
            initialEmail={signupEmail}
            initialRole={signupRoleView}
            initialRoleView={signupRoleView}
          />
        </div>
        <div className="border-t border-gray-200 bg-white py-6 text-center">
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <button
              type="button"
              className="font-semibold text-[#3A7CA5] hover:text-[#2F5D7C]"
              onClick={() => setIsLogin(true)}
            >
              Login here
            </button>
          </p>
          <div className="mx-auto mt-4 max-w-md px-4 text-xs text-gray-500">
            By using TechFlash, you agree to our{' '}
            <Link to="/terms-of-service" className="text-[#3A7CA5] hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy-policy" className="text-[#3A7CA5] hover:underline">
              Privacy Policy
            </Link>
            .
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-[#F7F7F7] px-4 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <img src={TECHFLASH_LOGO_LOGIN} alt="TechFlash" className="mx-auto h-16 object-contain" />
          <p className="mt-3 text-gray-600">Let&apos;s get the job done.</p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="rounded-lg bg-white px-6 py-8 shadow-md sm:px-10">
          <div className="mb-6 flex overflow-hidden rounded-md border">
            <button
              type="button"
              className={`flex-1 py-2 text-sm font-medium transition ${
                isLogin ? 'bg-[#3A7CA5] text-white' : 'bg-white text-[#2E2E2E] hover:bg-gray-100'
              }`}
              onClick={() => setIsLogin(true)}
            >
              Login
            </button>
            <button
              type="button"
              className={`flex-1 py-2 text-sm font-medium transition ${
                !isLogin ? 'bg-[#3A7CA5] text-white' : 'bg-white text-[#2E2E2E] hover:bg-gray-100'
              }`}
              onClick={() => navigate('/login?tab=signup')}
            >
              Register
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded border border-red-400 bg-red-100 p-3 text-red-700">{error}</div>
          )}

          {isDemoMode() && (
            <div className="mb-4 space-y-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleDemoLogin('admin')}
                className="w-full rounded-lg bg-[#FE6711] px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
              >
                {loading ? 'Signing in…' : 'Enter demo as Admin'}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleDemoLogin('company')}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
                >
                  Demo Company
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleDemoLogin('technician')}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
                >
                  Demo Technician
                </button>
              </div>
              <p className="text-center text-[11px] text-slate-500">Or sign in manually below</p>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-6">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-[#2E2E2E]">
                Email
              </label>
              <input
                type="email"
                id="login-email"
                name="email"
                value={loginData.email}
                onChange={handleInputChange}
                required
                placeholder="you@example.com"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-[#2E2E2E] shadow-sm focus:border-[#3A7CA5] focus:ring-[#3A7CA5]"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-[#2E2E2E]">
                Password
              </label>
              <input
                type="password"
                id="login-password"
                name="password"
                value={loginData.password}
                onChange={handleInputChange}
                required
                placeholder="••••••••"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-[#2E2E2E] shadow-sm focus:border-[#3A7CA5] focus:ring-[#3A7CA5]"
              />
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={resetLoading}
                  className="text-sm font-medium text-[#3A7CA5] hover:text-[#2F5D7C] disabled:opacity-50"
                >
                  {resetLoading ? 'Sending reset link…' : 'Forgot password?'}
                </button>
              </div>
            </div>

            {resetNotice && (
              <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                {resetNotice}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full justify-center rounded-md bg-[#3A7CA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#2F5D7C] focus:outline-none focus:ring-2 focus:ring-[#3A7CA5] focus:ring-offset-2 disabled:opacity-50"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Don&apos;t have an account?{' '}
              <Link
                to="/login?tab=signup"
                className="font-medium text-[#3A7CA5] hover:text-[#2F5D7C]"
              >
                Register here
              </Link>
            </p>
          </div>
        </div>
        <div className="mt-4 text-center text-xs text-gray-500">
          By using TechFlash, you agree to our{' '}
          <Link to="/terms-of-service" className="text-[#3A7CA5] hover:underline">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link to="/privacy-policy" className="text-[#3A7CA5] hover:underline">
            Privacy Policy
          </Link>
          .
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
