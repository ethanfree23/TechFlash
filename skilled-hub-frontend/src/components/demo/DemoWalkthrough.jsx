import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  DEMO_TOUR_STORAGE_KEY,
  DEMO_WALKTHROUGH_STEPS,
} from '../demo/demoWalkthroughSteps';
import { getDemoFlagshipJobId, getDemoReviewedJobId } from '../utils/demoMode';

function useTargetRect(selector, active, revision) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!active || !selector) {
      setRect(null);
      return undefined;
    }
    const update = () => {
      const el = document.querySelector(selector);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      });
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const t1 = window.setTimeout(update, 250);
    const t2 = window.setTimeout(update, 700);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [selector, active, revision]);

  return rect;
}

function buildPath(step) {
  if (!step?.path) return null;
  if (step.settingsTab) {
    return `${step.path}?tab=${encodeURIComponent(step.settingsTab)}`;
  }
  if (step.openFlagshipJob) {
    const id = getDemoFlagshipJobId();
    if (id) return `/jobs/${id}`;
  }
  if (step.openReviewedDemoJob) {
    const id = getDemoReviewedJobId();
    if (id) return `/jobs/${id}`;
  }
  return step.path;
}

export default function DemoWalkthrough({ run, onFinish, onMarketFilter }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [stepIndex, setStepIndex] = useState(0);
  const [navRevision, setNavRevision] = useState(0);

  const step = DEMO_WALKTHROUGH_STEPS[stepIndex];
  const targetPath = buildPath(step);
  const rect = useTargetRect(step?.target, run, `${stepIndex}-${navRevision}-${location.pathname}`);

  useEffect(() => {
    if (!run) return;
    const saved = localStorage.getItem(DEMO_TOUR_STORAGE_KEY);
    if (saved) {
      const idx = parseInt(saved, 10);
      if (Number.isFinite(idx) && idx >= 0 && idx < DEMO_WALKTHROUGH_STEPS.length) {
        setStepIndex(idx);
      }
    }
  }, [run]);

  useEffect(() => {
    if (!run || !targetPath) return;
    const [pathname, search = ''] = targetPath.split('?');
    const current = `${location.pathname}${location.search}`;
    const desired = `${pathname}${search ? `?${search}` : ''}`;
    if (current !== desired) {
      navigate(targetPath);
      window.setTimeout(() => setNavRevision((n) => n + 1), 400);
    }
  }, [run, targetPath, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!run || !step) return;
    if (step.marketFilter) {
      onMarketFilter?.(step.marketFilter);
      window.setTimeout(() => setNavRevision((n) => n + 1), 300);
    }
    if (step.userTab) {
      const tab = document.querySelector(`[data-demo="${step.userTab === 'company' ? 'company-profile' : 'technician-profile'}"]`);
      tab?.click();
      window.setTimeout(() => setNavRevision((n) => n + 1), 300);
    }
  }, [run, step, stepIndex, onMarketFilter]);

  const persist = useCallback((idx) => {
    try {
      localStorage.setItem(DEMO_TOUR_STORAGE_KEY, String(idx));
    } catch {
      /* ignore */
    }
  }, []);

  const finish = useCallback(() => {
    persist(DEMO_WALKTHROUGH_STEPS.length - 1);
    onFinish?.();
  }, [onFinish, persist]);

  const goToStep = useCallback(
    (next) => {
      setStepIndex(next);
      persist(next);
      setNavRevision((n) => n + 1);
    },
    [persist]
  );

  if (!run || !step) return null;

  const missingTarget = step.target && !rect && stepIndex > 0;

  return (
    <div className="fixed inset-0 z-[250]" role="dialog" aria-modal="true" aria-label="Demo walkthrough">
      <div className="absolute inset-0 bg-slate-900/55" onClick={finish} aria-hidden="true" />
      {rect && (
        <div
          className="fixed rounded-lg ring-2 ring-[#FE6711] ring-offset-2 ring-offset-transparent pointer-events-none"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)',
          }}
        />
      )}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Step {stepIndex + 1} of {DEMO_WALKTHROUGH_STEPS.length}
        </p>
        <h3 className="mt-1 text-base font-semibold text-slate-900">{step.title}</h3>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">{step.content}</p>
        {missingTarget && (
          <p className="mt-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5">
            Continue to the next step — the highlighted area will appear on that screen.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={finish}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            Skip tour
          </button>
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={() => goToStep(stepIndex - 1)}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              Back
            </button>
          )}
          {stepIndex < DEMO_WALKTHROUGH_STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => goToStep(stepIndex + 1)}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              className="rounded-md bg-[#FE6711] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
            >
              Finish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
