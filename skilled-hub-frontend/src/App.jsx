import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import JobsPage from './pages/JobsPage';
import JobDetail from './components/JobDetail';
import Dashboard from './pages/Dashboard';
import CreateJob from './pages/CreateJob';
import EditJob from './pages/EditJob';
import TechnicianProfilePage from './pages/TechnicianProfilePage';
import CompanyProfilePage from './pages/CompanyProfilePage';
import SettingsPage from './pages/SettingsPage';
import MessagesPage from './pages/MessagesPage';
import { auth } from './auth';

// Protected Route component
const ProtectedRoute = ({ children, isAuthenticated }) => {
  return isAuthenticated ? children : <Navigate to="/" replace />;
};

// Public Route component (redirects to dashboard if already authenticated)
const PublicRoute = ({ children, isAuthenticated }) => {
  if (!isAuthenticated) return children;
  return <Navigate to="/dashboard" replace />;
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check authentication status on app load
    const checkAuth = () => {
      const authenticated = auth.isAuthenticated();
      const currentUser = auth.getUser();
      
      console.log('App: checkAuth - authenticated:', authenticated); // Debug log
      console.log('App: checkAuth - currentUser:', currentUser); // Debug log
      
      setIsAuthenticated(authenticated);
      setUser(currentUser);
      setLoading(false);
    };

    checkAuth();
  }, []);

  const handleLoginSuccess = (userData) => {
    console.log('App: handleLoginSuccess called with userData:', userData); // Debug log
    setIsAuthenticated(true);
    setUser(userData);
    console.log('App: Authentication state updated'); // Debug log
    // Navigation will be handled in LoginPage.jsx
  };

  const handleLogout = () => {
    auth.logout();
    setIsAuthenticated(false);
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Loading SkilledHub...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="App">
        <Routes>
          {/* Public route - Login/Register page */}
          <Route 
            path="/" 
            element={
              <PublicRoute isAuthenticated={isAuthenticated}>
                <LoginPage onLoginSuccess={handleLoginSuccess} />
              </PublicRoute>
            } 
          />
          
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
              <ProtectedRoute isAuthenticated={isAuthenticated && user?.role === 'company'}>
                <CreateJob />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/jobs/:id"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <JobDetail />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/jobs/:id/edit"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated && user?.role === 'company'}>
                <EditJob />
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
                <SettingsPage user={user} onLogout={handleLogout} />
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
          
          {/* Catch all route - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

// Wrapper component for JobDetail to handle navigation
const JobDetailWrapper = ({ user, onLogout }) => {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-blue-600">SkilledHub</h1>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600">
                Welcome, <span className="font-medium">{user?.email}</span>
                <span className="ml-2 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                  {user?.role}
                </span>
              </div>
              <button 
                onClick={onLogout} 
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>
      
      <main className="py-8">
        <JobDetail />
      </main>
    </div>
  );
};

export default App;
