import { apiRequest } from './client';

export async function createFeedback(kind: 'problem' | 'suggestion' | 'referral', body: string, pagePath: string) {
  return apiRequest<Record<string, unknown>>('/feedback', {
    method: 'POST',
    body: JSON.stringify({
      kind,
      body,
      page_path: pagePath,
    }),
  });
}
