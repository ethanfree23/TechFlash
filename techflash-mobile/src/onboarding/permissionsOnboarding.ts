import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'tf_permissions_onboarding_v1';

export async function hasCompletedPermissionsOnboarding(): Promise<boolean> {
  const v = await AsyncStorage.getItem(KEY);
  return v === 'done';
}

export async function markPermissionsOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(KEY, 'done');
}

/** Test helper — clears the flag so a clean recording can re-show the flow. */
export async function resetPermissionsOnboardingFlag(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
