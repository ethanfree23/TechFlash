import { auth } from '../auth';
import { writeSignupRoleIntent } from './signupRoleIntent';

/**
 * Company "Post a job" entry from marketing: logged-in company/admin goes to job create;
 * other authenticated roles go to dashboard; anonymous users go to company signup on login.
 */
export function goCompanyPostJob(navigate) {
  writeSignupRoleIntent('company');
  if (auth.isAuthenticated()) {
    const user = auth.getUser();
    if (user?.role === 'company' || user?.role === 'admin') {
      navigate('/jobs/create');
      return;
    }
    navigate('/dashboard');
    return;
  }
  navigate('/login?tab=signup&role=company');
}
