import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { colors } from '../theme';
import { fetchGuidedOnboarding, webOnboardingUrl } from '../onboarding/guidedOnboarding';
import { useAuth } from '../auth/AuthContext';

/**
 * Blocks technicians with incomplete guided onboarding from the native app shell.
 * Completing setup happens in the hosted web wizard (Stripe/Checkr compatible).
 */
export default function GuidedOnboardingGateScreen({ onFinished }: { onFinished: () => void }) {
  const { user } = useAuth();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const recheck = useCallback(async () => {
    setChecking(true);
    setError('');
    try {
      const summary = await fetchGuidedOnboarding();
      if (summary && summary.feature_enabled && summary.required) {
        setError('Finish account setup in the browser, then tap I’ve finished setup.');
        return;
      }
      onFinished();
    } catch (e: any) {
      setError(e?.message || 'Could not refresh setup status.');
    } finally {
      setChecking(false);
    }
  }, [onFinished]);

  useEffect(() => {
    // Auto-poll lightly when returning from browser.
    const id = setInterval(() => {
      fetchGuidedOnboarding().then((summary) => {
        if (summary && !(summary.feature_enabled && summary.required)) onFinished();
      });
    }, 8000);
    return () => clearInterval(id);
  }, [onFinished]);

  const openWizard = async () => {
    const url = webOnboardingUrl();
    try {
      await Linking.openURL(url);
    } catch {
      setError(`Open ${url} in your browser to continue.`);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center' }}>
      <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
        Finish account setup
      </Text>
      <Text style={{ fontSize: 16, color: colors.muted, lineHeight: 22, marginBottom: 20 }}>
        {user?.first_name ? `Hi ${user.first_name}. ` : ''}
        TechFlash needs a few setup steps before you can browse jobs. Continue in your browser — Stripe and background check flows work best there.
      </Text>

      <Pressable
        onPress={openWizard}
        style={{
          backgroundColor: colors.primaryOrange,
          borderRadius: 14,
          minHeight: 52,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Continue setup</Text>
      </Pressable>

      <Pressable
        onPress={recheck}
        disabled={checking}
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 14,
          minHeight: 52,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.white,
        }}
      >
        {checking ? (
          <ActivityIndicator color={colors.primaryOrange} />
        ) : (
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>I’ve finished setup</Text>
        )}
      </Pressable>

      {error ? (
        <Text style={{ marginTop: 16, color: '#b45309', fontSize: 14 }}>{error}</Text>
      ) : null}
    </View>
  );
}
