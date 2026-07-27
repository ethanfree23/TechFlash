import React from 'react';
import AppHeader from '../AppHeader';
import AppFooter from './AppFooter';

export default function AppPageLayout({
  user,
  onLogout,
  activePage,
  emailVariant = 'simple',
  profileAvatar = false,
  children,
  maxWidthClass = 'max-w-7xl',
  contentClassName = '',
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        user={user}
        onLogout={onLogout}
        activePage={activePage}
        emailVariant={emailVariant}
        profileAvatar={profileAvatar}
      />
      <main
        className={`mx-auto w-full ${maxWidthClass} px-4 py-6 sm:px-6 sm:py-8 lg:px-8 pb-24 sm:pb-14 ${contentClassName}`}
      >
        {children}
      </main>
      <AppFooter />
    </div>
  );
}
