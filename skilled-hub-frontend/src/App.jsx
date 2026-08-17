import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import MarketingPage from './pages/MarketingPage';
import ForCompaniesPage from './pages/ForCompaniesPage';
import ForTechniciansPage from './pages/ForTechniciansPage';
import HowItWorksPage from './pages/HowItWorksPage';
import WhyTechFlashPage from './pages/WhyTechFlashPage';
import LoginPage from './pages/LoginPage';
import JobsPage from './pages/JobsPage';
import JobDetail from './components/JobDetail';
import Dashboard from './pages/Dashboard';
import CreateJob from './pages/CreateJob';
import EditJob from './pages/EditJob';
import TechnicianProfilePage from './pages/TechnicianProfilePage';
import TechnicianDirectoryPage from './pages/TechnicianDirectoryPage';
import CompanyProfilePage from './pages/CompanyProfilePage';
import SettingsPage from './pages/SettingsPage';
import MessagesPage from './pages/MessagesPage';
import CrmPage from './pages/CrmPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminUserDetailPage from './pages/AdminUserDetailPage';
import AdminReviewsPage from './pages/AdminReviewsPage';
import AdminTrustSafetyPage from './pages/AdminTrustSafetyPage';
import LegalPage from './pages/LegalPage';
import TermsOfServicePage from './pages/TermsOfServicePage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import CookiePolicyPage from './pages/CookiePolicyPage';
import PaymentTermsPage from './pages/PaymentTermsPage';
import DmcaIpClaimsPage from './pages/DmcaIpClaimsPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import PublicJobSharePage from './pages/PublicJobSharePage';
import ReferenceResponsePage from './pages/ReferenceResponsePage';
import DownloadAppPage from './pages/DownloadAppPage';
import FeedbackWidget from './components/FeedbackWidget';
import MasqueradeBanner from './components/MasqueradeBanner';
import DemoModeBanner from './components/DemoModeBanner';
import AppPageLayout from './components/layout/AppPageLayout';
import { auth } from './auth';
import { metaAPI, authAPI } from './api/api';
import { setApiDemoMode, setDemoFlagshipJobId, setDemoReviewedJobId, getDemoBasePath, isDemoPath, isDemoRoleAutoLoginSearch, isDemoRoleAutoLoginLocation } from './utils/demoMode';
import MetaPixelRouteTracker from './components/MetaPixelRouteTracker';

// Protected Route component
const ProtectedRoute = ({ children, isAuthenticated }) => {
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

// Public Route: stay on login when an explicit demo auto-login is requested so a stale
// masquerade session cannot skip the intended admin/company/technician sign-in.
const PublicRoute = ({ children, isAuthenticated }) => {
  const [searchParams] = useSearchParams();
  if (!isAuthenticated || isDemoRoleAutoLoginSearch(searchParams)) return children;
  return <Navigate to="/dashboard" replace />;
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(() => {
    const authenticated = auth.isAuthenticated();
    const currentUser = auth.getUser();
    setIsAuthenticated(authenticated);
    setUser(currentUser);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isDemoRoleAutoLoginLocation()) {
      auth.logout();
    }
    checkAuth();
    metaAPI.get().then((m) => {
      setApiDemoMode(m?.demo_mode);
      if (m?.flagship_job_id) setDemoFlagshipJobId(m.flagship_job_id);
      if (m?.reviewed_job_id) setDemoReviewedJobId(m.reviewed_job_id);
    }).catch(() => {});
  }, [checkAuth]);

  useEffect(() => {
    const syncAuthState = () => checkAuth();
    window.addEventListener('storage', syncAuthState);
    window.addEventListener('pageshow', syncAuthState);
    return () => {
      window.removeEventListener('storage', syncAuthState);
      window.removeEventListener('pageshow', syncAuthState);
    };
  }, [checkAuth]);

  useEffect(() => {
    if (!isAuthenticated || !auth.isMasquerading()) return;
    const jwtId = auth.jwtUserId();
    const current = auth.getUser();
    if (!jwtId || (current && String(current.id) === String(jwtId))) return;

    let cancelled = false;
    authAPI
      .getById(jwtId)
      .then((res) => {
        if (cancelled) return;
        const fetched = res?.user?.id ? res.user : res;
        if (fetched && auth.setUser(fetched)) {
          setUser(auth.getUser());
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user]);

  const handleLoginSuccess = (userData) => {
    setIsAuthenticated(true);
    setUser(userData);
  };

  const handleLogout = () => {
    auth.logout();
    setIsAuthenticated(false);
    setUser(null);
  };

  const handleUserUpdate = (updatedUser) => {
    if (updatedUser) {
      if (auth.setUser(updatedUser) === false) return;
      setUser(auth.getUser());
      return;
    }
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Loading TechFlash...</p>
        </div>
      </div>
    );
  }

  const routerBasename = getDemoBasePath() || undefined;

  return (
    <Router basename={routerBasename}>
      <MetaPixelRouteTracker />
      <div className="App min-w-0 overflow-x-hidden">
        <MasqueradeBanner />
        <DemoModeBanner />
        <FeedbackWidget user={user} />
        <Routes>
          {/* Marketing landing page */}
          <Route
            path="/"
            element={
              isDemoPath() ? (
                <Navigate to="/login" replace />
              ) : (
                <PublicRoute isAuthenticated={isAuthenticated}>
                  <MarketingPage onLoginSuccess={handleLoginSuccess} />
                </PublicRoute>
              )
            }
          />

          {/* Login/Register page */}
          <Route 
            path="/login" 
            element={
              <PublicRoute isAuthenticated={isAuthenticated}>
                <LoginPage onLoginSuccess={handleLoginSuccess} />
              </PublicRoute>
            } 
          />

          {/* Legal pages */}
          <Route path="/legal" element={<LegalPage />} />
          <Route path="/terms-of-service" element={<TermsOfServicePage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/cookie-policy" element={<CookiePolicyPage />} />
          <Route path="/payment-terms" element={<PaymentTermsPage />} />
          <Route path="/dmca-ip-policy" element={<DmcaIpClaimsPage />} />

          <Route path="/download" element={<DownloadAppPage />} />

          <Route path="/for-companies" element={<ForCompaniesPage />} />

          <Route path="/for-technicians" element={<ForTechniciansPage />} />

          <Route path="/how-it-works" element={<HowItWorksPage />} />

          <Route path="/why-techflash" element={<WhyTechFlashPage />} />

          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Public job share preview (no login) */}
          <Route path="/jobs/shared/:shareToken" element={<PublicJobSharePage />} />
          <Route path="/references/respond/:token" element={<ReferenceResponsePage />} />
          
          {/* Dashboard - both company and technician */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <Dashboard user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />
          
          {/* Protected routes */}
          <Route 
            path="/jobs" 
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <JobsPage user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            } 
          />
          
          <Route
            path="/jobs/create"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated && (user?.role === 'company' || user?.role === 'admin')}>
                <AppPageLayout user={user} onLogout={handleLogout} activePage="jobs" emailVariant="welcome" maxWidthClass="max-w-5xl">
                  <CreateJob />
                </AppPageLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/jobs/:id"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <AppPageLayout user={user} onLogout={handleLogout} activePage="jobs" emailVariant="welcome" maxWidthClass="max-w-6xl">
                  <JobDetail />
                </AppPageLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/jobs/:id/edit"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated && (user?.role === 'company' || user?.role === 'admin')}>
                <AppPageLayout user={user} onLogout={handleLogout} activePage="jobs" emailVariant="welcome" maxWidthClass="max-w-5xl">
                  <EditJob />
                </AppPageLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/technicians"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                {user?.role === 'company' || user?.role === 'admin' ? (
                  <TechnicianDirectoryPage user={user} onLogout={handleLogout} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )}
              </ProtectedRoute>
            }
          />

          <Route
            path="/technicians/:id"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <TechnicianProfilePage user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/companies/:id"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <CompanyProfilePage user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/settings"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <SettingsPage user={user} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/messages"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <MessagesPage user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/crm"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                {user?.role === 'admin' ? (
                  <CrmPage user={user} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )}
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/users/:userId"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                {user?.role === 'admin' ? (
                  <AdminUserDetailPage user={user} onLogout={handleLogout} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )}
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                {user?.role === 'admin' ? (
                  <AdminUsersPage user={user} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )}
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reviews"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                {user?.role === 'admin' ? (
                  <AdminReviewsPage user={user} onLogout={handleLogout} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )}
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/trust-safety"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                {user?.role === 'admin' ? (
                  <AdminTrustSafetyPage user={user} onLogout={handleLogout} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )}
              </ProtectedRoute>
            }
          />
          
          {/* Catch all route - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
