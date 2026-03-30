import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api/api';
import { auth } from '../auth';

const styles = {
  default: {
    label: 'text-[#2E2E2E]',
    input:
      'border-gray-300 focus:ring-[#3A7CA5] focus:border-[#3A7CA5] text-[#2E2E2E]',
    button:
      'bg-[#3A7CA5] hover:bg-[#2F5D7C] focus:ring-[#3A7CA5]',
  },
  marketing: {
    label: 'text-gray-800',
    input:
      'border-orange-100 focus:ring-[#FE6711] focus:border-[#FE6711] text-gray-800 bg-white/95',
    button:
      'bg-[#FE6711] hover:bg-[#e55a0a] focus:ring-[#FE6711] shadow-lg shadow-orange-200/40',
  },
};

const RegisterForm = ({
  onLoginSuccess,
  variant = 'default',
  idPrefix = 'register',
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registerData, setRegisterData] = useState({
    email: '',
    password: '',
    password_confirmation: '',
    role: 'technician',
  });

  const v = styles[variant] || styles.default;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (registerData.password !== registerData.password_confirmation) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      const response = await authAPI.register(registerData);
      auth.setToken(response.token);
      auth.setUser(response.user);
      onLoginSuccess(response.user);
      setTimeout(() => navigate('/dashboard'), 100);
    } catch (err) {
      console.error('Registration error:', err);
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 text-left">
      {error && (
        <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor={`${idPrefix}-email`} className={`block text-sm font-medium ${v.label}`}>
          Email
        </label>
        <input
          type="email"
          id={`${idPrefix}-email`}
          name="email"
          value={registerData.email}
          onChange={(e) =>
            setRegisterData((prev) => ({ ...prev, email: e.target.value }))
          }
          required
          placeholder="you@example.com"
          className={`mt-1 block w-full px-3 py-2.5 border rounded-xl shadow-sm ${v.input}`}
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-password`} className={`block text-sm font-medium ${v.label}`}>
          Password
        </label>
        <input
          type="password"
          id={`${idPrefix}-password`}
          name="password"
          value={registerData.password}
          onChange={(e) =>
            setRegisterData((prev) => ({ ...prev, password: e.target.value }))
          }
          required
          placeholder="••••••••"
          className={`mt-1 block w-full px-3 py-2.5 border rounded-xl shadow-sm ${v.input}`}
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-password-confirmation`}
          className={`block text-sm font-medium ${v.label}`}
        >
          Confirm Password
        </label>
        <input
          type="password"
          id={`${idPrefix}-password-confirmation`}
          name="password_confirmation"
          value={registerData.password_confirmation}
          onChange={(e) =>
            setRegisterData((prev) => ({
              ...prev,
              password_confirmation: e.target.value,
            }))
          }
          required
          placeholder="Re-enter password"
          className={`mt-1 block w-full px-3 py-2.5 border rounded-xl shadow-sm ${v.input}`}
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-role`} className={`block text-sm font-medium ${v.label}`}>
          I am a:
        </label>
        <select
          id={`${idPrefix}-role`}
          name="role"
          value={registerData.role}
          onChange={(e) =>
            setRegisterData((prev) => ({ ...prev, role: e.target.value }))
          }
          className={`mt-1 block w-full px-3 py-2.5 border rounded-xl shadow-sm ${v.input}`}
        >
          <option value="technician">Technician (Job Seeker)</option>
          <option value="company">Company (Hiring)</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={loading}
        className={`w-full flex justify-center py-3 px-4 rounded-xl text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${v.button}`}
      >
        {loading ? 'Creating account...' : 'Create account'}
      </button>
    </form>
  );
};

export default RegisterForm;
