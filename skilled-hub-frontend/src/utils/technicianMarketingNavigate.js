import { auth } from '../auth';
import { writeSignupRoleIntent } from './signupRoleIntent';

/**
 * Technician CTAs on public marketing pages: persist signup intent, then send logged-in techs to
 * job discovery; other roles to dashboard; anonymous users to technician signup on login.
 */
export function goTechnicianFindWork(navigate) {
  writeSignupRoleIntent('technician');
  if (auth.isAuthenticated()) {
    const user = auth.getUser();
    if (user?.role === 'technician') {
      navigate('/jobs');
      return;
    }
    navigate('/dashboard');
    return;
  }
  navigate('/login?tab=signup&role=technician');
}

/**
 * "Create your profile" — logged-in technicians go to their public profile editor view; others
 * follow the same signup path as Find Work when anonymous or wrong role.
 */
export function goTechnicianProfileOrSignup(navigate) {
  writeSignupRoleIntent('technician');
  if (auth.isAuthenticated()) {
    const user = auth.getUser();
    if (user?.role === 'technician' && user?.id != null) {
      navigate(`/technicians/${user.id}`);
      return;
    }
    navigate('/dashboard');
    return;
  }
  navigate('/login?tab=signup&role=technician');
}
