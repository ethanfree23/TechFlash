import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { colors } from '../theme';
import { markPermissionsOnboardingComplete } from '../onboarding/permissionsOnboarding';
import { requestExpoPushPermissions, setPushOptIn } from '../notifications/pushPrefs';
import { useAuth } from '../auth/AuthContext';

type Step = 'location' | 'notifications' | 'done';

/**
 * Explains and triggers real iOS system permission dialogs once after signup/login
 * when the OS has not already decided. Denial never blocks the app.
 */
export default function PermissionsOnboardingScreen({ onFinished }: { onFinished: () => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('location');
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState('');

  const finish = async () => {
    await markPermissionsOnboardingComplete();
    onFinished();
  };

  const onAllowLocation = async () => {
    setBusy(true);
    setStatusLine('');
    try {
      const existing = await Location.getForegroundPermissionsAsync();
      let status = existing.status;
      if (status === 'undetermined') {
        const asked = await Location.requestForegroundPermissionsAsync();
        status = asked.status;
      }
      setStatusLine(
        status === 'granted'
          ? 'Location allowed. Nearby jobs can use your device location.'
          : 'Location not allowed. You can still use a city or address in your profile.'
      );
      setStep('notifications');
    } catch {
      setStatusLine('Location request unavailable. Continue with a manual city or address.');
      setStep('notifications');
    } finally {
      setBusy(false);
    }
  };

  const onSkipLocation = async () => {
    setStatusLine('Skipped location. Set a city in Settings anytime.');
    setStep('notifications');
  };

  const onAllowNotifications = async () => {
    setBusy(true);
    setStatusLine('');
    try {
      const status = await requestExpoPushPermissions();
      const role = user?.role === 'company' || user?.role === 'technician' ? user.role : 'technician';
      if (status === 'granted') {
        await setPushOptIn(role, true);
        setStatusLine('Notifications allowed on this device.');
      } else {
        await setPushOptIn(role, false);
        setStatusLine('Notifications not allowed. Email preferences still work in Settings.');
      }
      setStep('done');
    } catch {
      setStatusLine('Notification request unavailable. You can enable later in Settings.');
      setStep('done');
    } finally {
      setBusy(false);
    }
  };

  const onSkipNotifications = async () => {
    setStatusLine('Skipped notifications. Enable later in Settings → Notifications.');
    setStep('done');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.inner}>
        <Text style={styles.brand}>TechFlash</Text>
        <Text style={styles.title}>
          {step === 'location'
            ? 'Show nearby jobs'
            : step === 'notifications'
              ? 'Stay on top of work'
              : 'You are ready'}
        </Text>
        <Text style={styles.body}>
          {step === 'location'
            ? 'TechFlash uses your location while you use the app to show nearby jobs and estimate distance. You can deny this and enter a city instead.'
            : step === 'notifications'
              ? 'TechFlash can send alerts for job updates, new messages, and account activity. You can deny this and keep using email preferences.'
              : 'Permissions are optional. Change them anytime in iOS Settings or in the app under Account → Settings.'}
        </Text>
        {!!statusLine ? <Text style={styles.status}>{statusLine}</Text> : null}

        {step === 'location' ? (
          <View style={styles.actions}>
            <Pressable
              style={[styles.primary, busy && styles.disabled]}
              onPress={onAllowLocation}
              disabled={busy}
            >
              <Text style={styles.primaryText}>
                {busy ? 'Asking…' : Platform.OS === 'ios' ? 'Continue' : 'Allow location'}
              </Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={onSkipLocation} disabled={busy}>
              <Text style={styles.secondaryText}>Not now</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 'notifications' ? (
          <View style={styles.actions}>
            <Pressable
              style={[styles.primary, busy && styles.disabled]}
              onPress={onAllowNotifications}
              disabled={busy}
            >
              <Text style={styles.primaryText}>
                {busy ? 'Asking…' : Platform.OS === 'ios' ? 'Continue' : 'Allow notifications'}
              </Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={onSkipNotifications} disabled={busy}>
              <Text style={styles.secondaryText}>Not now</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 'done' ? (
          <View style={styles.actions}>
            <Pressable style={styles.primary} onPress={finish}>
              <Text style={styles.primaryText}>Enter TechFlash</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.foot}>
          iOS shows each system permission dialog only while undecided. For a clean recording, delete
          and reinstall the app (or reset Location/Notifications for TechFlash in iOS Settings).
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  brand: {
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '800',
    color: colors.primaryOrange,
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  body: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
    textAlign: 'center',
  },
  status: {
    marginTop: 16,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    textAlign: 'center',
  },
  actions: { marginTop: 32, gap: 12 },
  primary: {
    backgroundColor: colors.primaryOrange,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryText: { color: colors.white, fontSize: 17, fontWeight: '700' },
  secondary: {
    backgroundColor: colors.white,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.text, fontSize: 17, fontWeight: '600' },
  disabled: { opacity: 0.65 },
  foot: {
    marginTop: 28,
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
    textAlign: 'center',
  },
});
