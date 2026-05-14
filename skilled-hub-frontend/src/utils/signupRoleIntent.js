/**
 * Persists marketing signup "role intent" for email capture flows on the public landing pages.
 *
 * Why sessionStorage: users may hit "Post a Job" (company) or "Find Work" (technician), leave for
 * `/login`, then use the browser Back button to the landing page. We still want the next email-only
 * submission to respect the last explicit CTA when reasonable.
 *
 * Email-only rule (no prior company/technician CTA in this session):
 * - Defaults to `technician` for `marketingLeadsAPI.role_view` and `/login?role=` when the user
 *   submits the generic email form without first clicking a role-specific CTA.
 *
 * Company-focused CTAs on `/for-companies` and related buttons use `writeSignupRoleIntent('company')` via
 * `companyJobPostNavigate` / `goSignupDirect`. Technician-focused CTAs use `writeSignupRoleIntent('technician')`
 * via `technicianMarketingNavigate` (including the `/for-technicians` landing page).
 *
 * This is intentionally invisible UI — do not add a role toggle on the landing page.
 */
const TF_SIGNUP_ROLE_INTENT_KEY = 'tf_signup_role_intent';

export function readSignupRoleIntent() {
  try {
    const v = sessionStorage.getItem(TF_SIGNUP_ROLE_INTENT_KEY);
    if (v === 'company' || v === 'technician') return v;
  } catch {
    // ignore private mode / access errors
  }
  return 'technician';
}

export function writeSignupRoleIntent(role) {
  if (role !== 'company' && role !== 'technician') return;
  try {
    sessionStorage.setItem(TF_SIGNUP_ROLE_INTENT_KEY, role);
  } catch {
    // ignore
  }
}
