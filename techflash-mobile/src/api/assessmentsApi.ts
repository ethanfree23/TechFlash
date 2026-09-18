import { apiRequest } from './client';

/**
 * Technician-facing skills assessment endpoints.
 *
 * Scoring happens entirely server-side: nothing here ever receives which
 * answer is correct while an attempt is open, so the app cannot compute or
 * reveal a score early.
 */

export type AssessmentState = 'not_started' | 'in_progress' | 'completed';

export interface AssessmentResult {
  id: number;
  assessment_id: number;
  assessment_slug: string;
  assessment_title: string;
  trade_type: string | null;
  score: number;
  score_band_slug: string | null;
  score_band_label: string | null;
  completed_at: string | null;
  version_number: number | null;
  disclaimer: string;
  category_scores?: { slug: string; name: string; score: number }[] | null;
}

export interface InProgressAttemptSummary {
  id: number;
  attempt_number: number;
  started_at: string;
  expires_at: string | null;
  remaining_seconds: number | null;
  answered_questions: number;
  total_questions: number;
  progress_percent: number;
}

export interface ScoreBand {
  slug: string;
  label: string;
  min_score: number;
  max_score: number;
}

export interface CatalogAssessment {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  trade_type: string | null;
  question_count: number;
  time_limit_minutes: number | null;
  estimated_minutes: number | null;
  instructions: string | null;
  max_attempts: number | null;
  retake_wait_hours: number | null;
  version_number: number | null;
  allow_resume: boolean;
  allow_back_navigation: boolean;
  score_bands: ScoreBand[];
  topics: { slug: string; name: string; question_count: number }[];
  disclaimer: string;
  recommended: boolean;
  state: AssessmentState;
  attempts_count: number;
  can_start: boolean;
  start_blocked_reason: string | null;
  start_blocked_message: string | null;
  attempts_used: number;
  retake_available_at: string | null;
  in_progress_attempt: InProgressAttemptSummary | null;
  result: AssessmentResult | null;
}

export interface ProfileContribution {
  state: AssessmentState;
  label: string;
  assessment_title: string | null;
  score: number | null;
  score_band_label: string | null;
  recommended_assessment_slug: string | null;
  recommended_assessment_title: string | null;
  earned_strength_percent: number;
  available_strength_percent: number;
  counts_toward_job_access: boolean;
}

export interface AssessmentCatalog {
  assessments: CatalogAssessment[];
  disclaimer: string;
  profile_contribution: ProfileContribution | null;
}

export interface AttemptChoice {
  id: number;
  body: string;
}

export interface AttemptQuestion {
  id: number;
  question_id: number;
  position: number;
  prompt: string;
  difficulty: string | null;
  category: { id: number; slug: string; name: string } | null;
  media: { url: string; type: string | null; alt_text: string | null } | null;
  selected_answer_choice_id: number | null;
  choices: AttemptChoice[];
}

export interface AssessmentAttempt {
  id: number;
  status: 'in_progress' | 'completed' | 'expired';
  attempt_number: number;
  assessment_id: number;
  assessment_slug: string;
  assessment_title: string;
  version_number: number;
  started_at: string;
  expires_at: string | null;
  remaining_seconds: number | null;
  time_limit_minutes: number | null;
  total_questions: number;
  answered_questions: number;
  progress_percent: number;
  allow_resume: boolean;
  allow_back_navigation: boolean;
  questions: AttemptQuestion[];
  resumed?: boolean;
}

export interface AttemptCategoryResult {
  id: number;
  slug: string;
  name: string;
  score: number;
  questions_count: number;
  correct_count: number;
}

export interface AttemptReviewEntry {
  position: number;
  question_id: number;
  prompt: string;
  category: { slug: string; name: string } | null;
  answered: boolean;
  correct: boolean | null;
  selected_answer_choice_id: number | null;
  correct_answer_choice_id: number | null;
  explanation: string | null;
  choices: AttemptChoice[];
}

export interface AttemptResult {
  id: number;
  status: 'in_progress' | 'completed' | 'expired';
  attempt_number: number;
  assessment_id: number;
  assessment_slug: string;
  assessment_title: string;
  version_number: number;
  score: number | null;
  score_band_slug: string | null;
  score_band_label: string | null;
  passed: boolean | null;
  total_questions: number;
  answered_questions: number;
  correct_answers: number;
  duration_seconds: number | null;
  started_at: string;
  submitted_at: string | null;
  completed_at: string | null;
  time_limit_minutes: number | null;
  category_results: AttemptCategoryResult[];
  disclaimer: string;
  review?: AttemptReviewEntry[];
  already_submitted?: boolean;
}

export interface SaveAnswersResponse {
  id: number;
  status: string;
  saved_count: number;
  answered_questions: number;
  total_questions: number;
  progress_percent: number;
  remaining_seconds: number | null;
}

export interface AnswerInput {
  question_id: number;
  answer_choice_id: number | null;
}

export async function getAssessmentCatalog(): Promise<AssessmentCatalog> {
  const data = await apiRequest<AssessmentCatalog>('/assessments');
  return data || { assessments: [], disclaimer: '', profile_contribution: null };
}

export async function getAssessment(slugOrId: string | number): Promise<CatalogAssessment | null> {
  return apiRequest<CatalogAssessment>(`/assessments/${slugOrId}`);
}

/**
 * Starting is idempotent on the server: if an attempt is already open this
 * returns that same attempt (with `resumed: true`) rather than burning a retake.
 */
export async function startAttempt(slugOrId: string | number): Promise<AssessmentAttempt | null> {
  return apiRequest<AssessmentAttempt>(`/assessments/${slugOrId}/attempts`, { method: 'POST' });
}

export async function getAttempt(
  attemptId: number,
  options: { includeReview?: boolean } = {}
): Promise<(AssessmentAttempt & AttemptResult) | null> {
  const query = options.includeReview ? '?include=review' : '';
  return apiRequest<AssessmentAttempt & AttemptResult>(`/assessment_attempts/${attemptId}${query}`);
}

export async function saveAnswers(
  attemptId: number,
  answers: AnswerInput[]
): Promise<SaveAnswersResponse | null> {
  return apiRequest<SaveAnswersResponse>(`/assessment_attempts/${attemptId}/answers`, {
    method: 'PATCH',
    body: JSON.stringify({ answers }),
  });
}

/** Any answers not yet flushed can ride along with the submit request. */
export async function submitAttempt(
  attemptId: number,
  answers?: AnswerInput[]
): Promise<AttemptResult | null> {
  return apiRequest<AttemptResult>(`/assessment_attempts/${attemptId}/submit`, {
    method: 'POST',
    body: JSON.stringify(answers?.length ? { answers } : {}),
  });
}

export async function getAttemptHistory(
  assessmentSlug?: string
): Promise<{ attempts: AttemptResult[] }> {
  const query = assessmentSlug ? `?assessment_slug=${encodeURIComponent(assessmentSlug)}` : '';
  const data = await apiRequest<{ attempts: AttemptResult[] }>(`/assessment_attempts${query}`);
  return data || { attempts: [] };
}
