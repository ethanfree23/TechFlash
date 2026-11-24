import AsyncStorage from '@async-storage/async-storage';
import { apiRequest } from '../api/client';

const CACHE_KEY = 'tf_guided_onboarding_v1';

export type GuidedOnboardingSummary = {
  applicable?: boolean;
  feature_enabled?: boolean;
  required?: boolean;
  status?: string;
  percent?: number;
  current_section?: string;
};

export async function fetchGuidedOnboarding(): Promise<GuidedOnboardingSummary | null> {
  try {
    const data = await apiRequest('/technician_onboarding');
    const summary: GuidedOnboardingSummary = {
      applicable: true,
      feature_enabled: !!data?.feature_enabled,
      required: !!(data?.feature_enabled && data?.required),
      status: data?.status,
      percent: data?.percent,
      current_section: data?.current_section,
    };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(summary));
    return summary;
  } catch {
    return null;
  }
}

export function summaryFromUser(user: any): GuidedOnboardingSummary | null {
  if (!user || user.role !== 'technician') return null;
  return (user.guided_onboarding as GuidedOnboardingSummary) || null;
}

export function webOnboardingUrl(): string {
  return 'https://techflash.app/technician/onboarding';
}
