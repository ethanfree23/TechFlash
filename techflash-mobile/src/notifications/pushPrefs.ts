import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

const keyFor = (role: 'company' | 'technician') => `tf_push_opt_in_${role}`;
const TOKEN_KEY = 'tf_expo_push_token_v1';

/** Must match app.json / app.config extra.eas.projectId */
const EAS_PROJECT_ID = '80072b41-0158-428e-8019-ecebcfbde278';

export async function getPushOptIn(role: 'company' | 'technician'): Promise<boolean> {
  const v = await AsyncStorage.getItem(keyFor(role));
  return v === 'true';
}

export async function setPushOptIn(role: 'company' | 'technician', enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(keyFor(role), enabled ? 'true' : 'false');
}

export async function getStoredExpoPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

/**
 * Requests the native OS notification permission.
 * When granted, attempts to fetch an Expo push token for local storage.
 * Remote push delivery requires backend token registration (not yet wired) —
 * do not claim delivery works end-to-end until that path is tested.
 */
export async function requestExpoPushPermissions(): Promise<Notifications.PermissionStatus> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  if (status === 'granted') {
    await maybeStoreExpoPushToken();
  }
  return status;
}

async function maybeStoreExpoPushToken(): Promise<void> {
  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    if (token?.data) {
      await AsyncStorage.setItem(TOKEN_KEY, token.data);
    }
  } catch {
    // Simulator / missing entitlements — permission may still be granted.
  }
}

export function openSystemSettings(): void {
  Linking.openSettings();
}
