import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminDemoAPI } from '../api/api';
import { setDemoFlagshipJobId, setDemoReviewedJobId } from '../utils/demoMode';

export default function useDemoReset() {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState(null);

  const runReset = useCallback(async () => {
    setBusy(true);
    try {
      const result = await adminDemoAPI.reset();
      setConfirmOpen(false);
      const stats = result.stats || result;
      if (stats?.flagship_job_id) setDemoFlagshipJobId(stats.flagship_job_id);
      if (stats?.reviewed_job_id) setDemoReviewedJobId(stats.reviewed_job_id);
      setAlert({
        title: 'Demo reset complete',
        message: `Marketplace restored with ${stats?.jobs ?? 96} jobs across Houston, Austin, and Dallas.`,
      });
      navigate('/dashboard');
      window.location.reload();
    } catch (e) {
      setAlert({
        title: 'Reset failed',
        message: e.message || 'Could not reset demo data. Try again in a moment.',
      });
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  }, [navigate]);

  return {
    confirmOpen,
    setConfirmOpen,
    busy,
    alert,
    setAlert,
    runReset,
  };
}
