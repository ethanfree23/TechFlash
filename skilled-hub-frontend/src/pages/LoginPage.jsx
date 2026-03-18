import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api/api';
import { auth } from '../auth';

const LoginPage = ({ onLoginSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [registerData, setRegisterData] = useState({
    email: '',
    password: '',
    password_confirmation: '',
    role: 'technician',
  });
  const navigate = useNavigate();

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      console.log('Starting login process...');
      const response = await authAPI.login(loginData.email, loginData.password);
      console.log('Login response:', response);
      
      auth.setToken(response.token);
      auth.setUser(response.user);
      console.log('Token and user set in auth');
      
      onLoginSuccess(response.user);
      console.log('onLoginSuccess called');
      
      console.log('User role:', response.user.role);
      console.log('User role type:', typeof response.user.role);
      console.log('Role comparison result:', response.user.role === 'company');
      
      setTimeout(() => navigate('/dashboard'), 100);
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (registerData.password !== registerData.password_confirmation) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      console.log('Starting registration process...');
      console.log('Registration data:', registerData);
      const response = await authAPI.register(registerData);
      console.log('Register response:', response);
      
      auth.setToken(response.token);
      auth.setUser(response.user);
      console.log('Token and user set in auth');
      
      onLoginSuccess(response.user);
      console.log('onLoginSuccess called');
      
      console.log('User role:', response.user.role);
      console.log('User role type:', typeof response.user.role);
      console.log('Role comparison result:', response.user.role === 'company');
      
      setTimeout(() => navigate('/dashboard'), 100);
    } catch (err) {
      console.error('Registration error:', err);
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e, formType) => {
    const { name, value } = e.target;
    formType === 'login'
      ? setLoginData((prev) => ({ ...prev, [name]: value }))
      : setRegisterData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="min-h-screen bg-[#F7F7F7] flex flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <img src="/techflash-logo.png" alt="TechFlash" className="h-16 mx-auto object-contain" />
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
                  onChange={(e) => handleInputChange(e, 'login')}
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
                  onChange={(e) => handleInputChange(e, 'login')}
                  required
                  placeholder="••••••••"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#3A7CA5] focus:border-[#3A7CA5] text-[#2E2E2E]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 rounded-md text-sm font-medium text-white bg-[#3A7CA5] hover:bg-[#2F5D7C] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#3A7CA5] disabled:opacity-50"
              >
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-6">
              <div>
                <label htmlFor="register-email" className="block text-sm font-medium text-[#2E2E2E]">
                  Email
                </label>
                <input
                  type="email"
                  id="register-email"
                  name="email"
                  value={registerData.email}
                  onChange={(e) => handleInputChange(e, 'register')}
                  required
                  placeholder="you@example.com"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#3A7CA5] focus:border-[#3A7CA5] text-[#2E2E2E]"
                />
              </div>

              <div>
                <label htmlFor="register-password" className="block text-sm font-medium text-[#2E2E2E]">
                  Password
                </label>
                <input
                  type="password"
                  id="register-password"
                  name="password"
                  value={registerData.password}
                  onChange={(e) => handleInputChange(e, 'register')}
                  required
                  placeholder="••••••••"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#3A7CA5] focus:border-[#3A7CA5] text-[#2E2E2E]"
                />
              </div>

              <div>
                <label htmlFor="register-password-confirmation" className="block text-sm font-medium text-[#2E2E2E]">
                  Confirm Password
                </label>
                <input
                  type="password"
                  id="register-password-confirmation"
                  name="password_confirmation"
                  value={registerData.password_confirmation}
                  onChange={(e) => handleInputChange(e, 'register')}
                  required
                  placeholder="Re-enter password"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#3A7CA5] focus:border-[#3A7CA5] text-[#2E2E2E]"
                />
              </div>

              <div>
                <label htmlFor="register-role" className="block text-sm font-medium text-[#2E2E2E]">
                  I am a:
                </label>
                <select
                  id="register-role"
                  name="role"
                  value={registerData.role}
                  onChange={(e) => handleInputChange(e, 'register')}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-[#2E2E2E] focus:ring-[#3A7CA5] focus:border-[#3A7CA5]"
                >
                  <option value="technician">Technician (Job Seeker)</option>
                  <option value="company">Company (Hiring)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 rounded-md text-sm font-medium text-white bg-[#3A7CA5] hover:bg-[#2F5D7C] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#3A7CA5] disabled:opacity-50"
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>
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
      </div>
    </div>
  );
};

export default LoginPage;
