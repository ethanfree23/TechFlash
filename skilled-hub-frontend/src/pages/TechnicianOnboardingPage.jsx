import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../auth';
import { authAPI, profilesAPI } from '../api/api';
import { technicianOnboardingAPI } from '../api/technicianOnboardingApi';
import OnboardingShell from '../components/onboarding/OnboardingShell';
import WelcomeStep from '../components/onboarding/steps/WelcomeStep';
import ProfileSteps from '../components/onboarding/steps/ProfileSteps';
import VerificationSteps from '../components/onboarding/steps/VerificationSteps';
import NotificationsStep from '../components/onboarding/steps/NotificationsStep';
import BillingStep from '../components/onboarding/steps/BillingStep';
import MembershipStep from '../components/onboarding/steps/MembershipStep';
import ReviewStep from '../components/onboarding/steps/ReviewStep';
import { ONBOARDING_SECTIONS } from '../components/onboarding/onboardingSteps';

const SECTION_TITLES = {
  profile: {
    title: 'Your Profile',
    subtitle: 'Confirm your details so companies know who they are hiring.',
  },
  verification: {
    title: 'Verification',
    subtitle: 'Submit what TechFlash needs from you. External reviews can finish after setup.',
  },
  notifications: {
    title: 'Notifications',
    subtitle: 'Choose how you want to hear about new work.',
  },
  billing: {
    title: 'Billing & Payments',
    subtitle: 'Set up how you receive earnings from completed jobs.',
  },
  membership: {
    title: 'Membership & Job Access',
    subtitle: 'Review your plan. Paid upgrades are optional and require confirmation.',
  },
};

export default function TechnicianOnboardingPage({ user, onUserUpdate, onLogout }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [progress, setProgress] = useState(null);
  const [profile, setProfile] = useState(null);
  const [currentUser, setCurrentUser] = useState(user);
  const [screen, setScreen] = useState('welcome');
  const [substep, setSubstep] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [onboarding, profileRes, meRes] = await Promise.all([
      technicianOnboardingAPI.get(),
      profilesAPI.getTechnicianProfile().catch(() => null),
      authAPI.updateMe ? authAPI.getById?.(user?.id).catch(() => null) : null,
    ]);
    // Prefer /users/me if available via a lightweight path — fall back to auth user.
    let nextUser = auth.getUser() || user;
    try {
      // authAPI doesn't expose getMe; use profile-adjacent refresh via guided_onboarding only.
      nextUser = {
        ...nextUser,
        guided_onboarding: {
          applicable: true,
          feature_enabled: !!onboarding?.feature_enabled,
          required: !!onboarding?.required,
          status: onboarding?.status,
          percent: onboarding?.percent,
          current_section: onboarding?.current_section,
        },
      };
      auth.setUser(nextUser);
      onUserUpdate?.(nextUser);
    } catch {
      /* ignore */
    }

    setProgress(onboarding);
    setProfile(profileRes?.technician_profile || profileRes?.profile || profileRes);
    setCurrentUser((prev) => ({
      ...prev,
      ...onboarding?.user,
      email: prev?.email || onboarding?.user?.email,
      job_alert_preference: prev?.job_alert_preference,
      email_notification_preferences: prev?.email_notification_preferences,
      email_notifications_enabled: prev?.email_notifications_enabled,
      job_alert_notifications_enabled: prev?.job_alert_notifications_enabled,
    }));
    return onboarding;
  }, [onUserUpdate, user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const onboarding = await refresh();
        if (cancelled) return;
        const paramSection = searchParams.get('section');
        if (paramSection && [...ONBOARDING_SECTIONS.map((s) => s.key), 'review', 'welcome'].includes(paramSection)) {
          setScreen(paramSection);
          setSubstep(paramSection === 'profile' ? 'personal' : paramSection === 'verification' ? 'licenses' : null);
        } else if (onboarding?.status === 'in_progress' && onboarding?.current_section) {
          setScreen(onboarding.current_section === 'welcome' ? 'welcome' : onboarding.current_section);
          setSubstep(onboarding.current_substep || null);
        } else if (onboarding?.status === 'completed' && !onboarding?.required) {
          navigate('/dashboard', { replace: true });
          return;
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load onboarding.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const persistProgress = async ({ section, substep: nextSubstep, completedSection } = {}) => {
    const payload = {
      current_section: section,
      current_substep: nextSubstep,
      completed_section: completedSection,
    };
    const updated = await technicianOnboardingAPI.update(payload);
    setProgress(updated);
    return updated;
  };

  const goTo = async (nextScreen, nextSubstep = null) => {
    setScreen(nextScreen);
    setSubstep(nextSubstep);
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      sp.set('section', nextScreen);
      if (nextSubstep) sp.set('substep', nextSubstep);
      else sp.delete('substep');
      return sp;
    }, { replace: true });
    try {
      await persistProgress({ section: nextScreen, substep: nextSubstep });
    } catch {
      /* local nav still works */
    }
  };

  const completeSectionAndAdvance = async (sectionKey) => {
    setBusy(true);
    setError('');
    try {
      await persistProgress({ section: sectionKey, completedSection: sectionKey });
      await refresh();
      const idx = ONBOARDING_SECTIONS.findIndex((s) => s.key === sectionKey);
      if (idx >= 0 && idx < ONBOARDING_SECTIONS.length - 1) {
        const next = ONBOARDING_SECTIONS[idx + 1].key;
        await goTo(next, next === 'profile' ? 'personal' : next === 'verification' ? 'licenses' : null);
      } else {
        await goTo('review');
      }
    } catch (e) {
      setError(e.message || 'Could not save progress.');
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async () => {
    setBusy(true);
    try {
      await technicianOnboardingAPI.start({ section: 'profile', substep: 'personal' });
      await goTo('profile', 'personal');
    } finally {
      setBusy(false);
    }
  };

  const handleFinish = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await technicianOnboardingAPI.complete();
      if (!result?.ok) {
        setError(result?.error || 'Could not complete onboarding.');
        if (result?.onboarding) setProgress(result.onboarding);
        return;
      }
      const nextUser = {
        ...(auth.getUser() || currentUser),
        guided_onboarding: {
          applicable: true,
          feature_enabled: true,
          required: false,
          status: 'completed',
          percent: 100,
        },
      };
      auth.setUser(nextUser);
      onUserUpdate?.(nextUser);
      sessionStorage.setItem('tf_onboarding_welcome', '1');
      navigate('/dashboard', { replace: true });
    } catch (e) {
      setError(e?.details?.error || e.message || 'Could not complete onboarding.');
      if (e?.details?.onboarding) setProgress(e.details.onboarding);
    } finally {
      setBusy(false);
    }
  };

  const handleExit = async () => {
    try {
      await persistProgress({ section: screen, substep });
    } catch {
      /* ignore */
    }
    onLogout?.();
    navigate('/login', { replace: true });
  };

  const titles = useMemo(() => SECTION_TITLES[screen] || {}, [screen]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-tf-orange border-t-transparent" />
          <p className="text-sm text-white/70">Loading your setup…</p>
        </div>
      </div>
    );
  }

  const completedSections = progress?.completed_sections || [];

  return (
    <OnboardingShell
      user={currentUser}
      activeKey={screen}
      completedSections={completedSections}
      sectionStatuses={progress?.sections || {}}
      onJump={(key) => goTo(key, key === 'profile' ? 'personal' : key === 'verification' ? 'licenses' : null)}
      onExit={handleExit}
      title={screen !== 'welcome' && screen !== 'review' ? titles.title : undefined}
      subtitle={screen !== 'welcome' && screen !== 'review' ? titles.subtitle : undefined}
    >
      {error && screen !== 'review' ? (
        <p className="mb-4 text-sm font-medium text-red-600">{error}</p>
      ) : null}

      {screen === 'welcome' ? (
        <WelcomeStep user={currentUser} progress={progress} onStart={handleStart} loading={busy} />
      ) : null}

      {screen === 'profile' ? (
        <ProfileSteps
          profile={profile}
          user={currentUser}
          substep={substep || 'personal'}
          onSubstepChange={(s) => goTo('profile', s)}
          onSaved={refresh}
          onBack={() => goTo('welcome')}
          onContinue={() => completeSectionAndAdvance('profile')}
        />
      ) : null}

      {screen === 'verification' ? (
        <VerificationSteps
          section={progress?.sections?.verification}
          substep={substep || 'licenses'}
          onSubstepChange={(s) => goTo('verification', s)}
          onBack={() => goTo('profile', 'preferences')}
          onContinue={() => completeSectionAndAdvance('verification')}
          onRefresh={refresh}
        />
      ) : null}

      {screen === 'notifications' ? (
        <NotificationsStep
          user={currentUser}
          onBack={() => goTo('verification', 'background')}
          onContinue={() => completeSectionAndAdvance('notifications')}
          onSaved={async () => {
            const me = auth.getUser();
            // Refresh local user prefs after save
            setCurrentUser((prev) => ({ ...prev, ...me }));
            await refresh();
          }}
        />
      ) : null}

      {screen === 'billing' ? (
        <BillingStep
          section={progress?.sections?.billing}
          onBack={() => goTo('notifications')}
          onContinue={() => completeSectionAndAdvance('billing')}
          onRefresh={refresh}
        />
      ) : null}

      {screen === 'membership' ? (
        <MembershipStep
          section={progress?.sections?.membership}
          onBack={() => goTo('billing')}
          onContinue={() => completeSectionAndAdvance('membership')}
        />
      ) : null}

      {screen === 'review' ? (
        <ReviewStep
          progress={progress}
          onJump={(key) => goTo(key)}
          onBack={() => goTo('membership')}
          onFinish={handleFinish}
          loading={busy}
          error={error}
        />
      ) : null}
    </OnboardingShell>
  );
}
