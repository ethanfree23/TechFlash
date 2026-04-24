import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { TECHFLASH_LOGO_LOGIN } from '../constants/branding';
import { authAPI, passwordResetsAPI } from '../api/api';
import { auth } from '../auth';
import RegisterForm from '../components/RegisterForm';

const LoginPage = ({ onLoginSuccess }) => {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const signupEmail = searchParams.get('email') || '';
  const signupRoleView = searchParams.get('role') === 'company' ? 'company' : 'technician';
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

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await authAPI.login(loginData.email, loginData.password);
      auth.setToken(response.token);
      auth.setUser(response.user);
      onLoginSuccess(response.user);
      setTimeout(() => navigate('/dashboard'), 100);
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div className="min-h-screen bg-[#F7F7F7] flex flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <img src={TECHFLASH_LOGO_LOGIN} alt="TechFlash" className="h-16 mx-auto object-contain" />
          <p className="mt-3 text-gray-600">Let's get the job done.</p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-md rounded-lg sm:px-10">
          <div className="flex rounded-md overflow-hidden border mb-6">
            <button
              className={`flex-1 py-2 text-sm font-medium transition ${
                isLogin
                  ? 'bg-[#3A7CA5] text-white'
                  : 'bg-white text-[#2E2E2E] hover:bg-gray-100'
              }`}
              onClick={() => setIsLogin(true)}
            >
              Login
            </button>
            <button
              className={`flex-1 py-2 text-sm font-medium transition ${
                !isLogin
                  ? 'bg-[#3A7CA5] text-white'
                  : 'bg-white text-[#2E2E2E] hover:bg-gray-100'
              }`}
              onClick={() => setIsLogin(false)}
            >
              Register
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {isLogin ? (
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
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#3A7CA5] focus:border-[#3A7CA5] text-[#2E2E2E]"
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
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#3A7CA5] focus:border-[#3A7CA5] text-[#2E2E2E]"
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
                <div className="p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm">
                  {resetNotice}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 rounded-md text-sm font-medium text-white bg-[#3A7CA5] hover:bg-[#2F5D7C] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#3A7CA5] disabled:opacity-50"
              >
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </form>
          ) : (
            <RegisterForm
              onLoginSuccess={onLoginSuccess}
              initialEmail={signupEmail}
              initialRole={signupRoleView}
              initialRoleView={signupRoleView}
            />
          )}

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <button
                className="font-medium text-[#3A7CA5] hover:text-[#2F5D7C]"
                onClick={() => setIsLogin(!isLogin)}
              >
                {isLogin ? 'Register here' : 'Login here'}
              </button>
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
