import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppPageLayout from '../components/layout/AppPageLayout';
import { assessmentsAPI } from '../api/api';

/**
 * Taking an assessment, one question at a time.
 *
 * Answers autosave as they are tapped. Anything not yet confirmed by the server
 * is held in localStorage, so closing the tab, losing connectivity, or a
 * refresh mid-sitting does not lose work: reopening replays the queue and
 * resumes at the first unanswered question.
 *
 * The countdown here is a display convenience. The server owns the deadline.
 */

const FLUSH_DELAY_MS = 900;
const pendingKey = (attemptId) => `assessment_pending_answers_${attemptId}`;

function formatClock(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}

function readPending(attemptId) {
  try {
    const raw = window.localStorage.getItem(pendingKey(attemptId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function AssessmentAttemptPage({ user, onLogout }) {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const numericAttemptId = Number(attemptId);

  const [attempt, setAttempt] = useState(null);
  const [selections, setSelections] = useState({});
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('idle');
  const [secondsLeft, setSecondsLeft] = useState(null);

  const pendingRef = useRef({});
  const flushTimer = useRef(null);
  const deadlineRef = useRef(null);
  const finalizedRef = useRef(false);

  const persistPending = useCallback(() => {
    try {
      if (Object.keys(pendingRef.current).length === 0) {
        window.localStorage.removeItem(pendingKey(numericAttemptId));
      } else {
        window.localStorage.setItem(pendingKey(numericAttemptId), JSON.stringify(pendingRef.current));
      }
    } catch {
      /* a blocked storage quota must not break the sitting */
    }
  }, [numericAttemptId]);

  const goToResult = useCallback(
    (notice) => {
      finalizedRef.current = true;
      try {
        window.localStorage.removeItem(pendingKey(numericAttemptId));
      } catch {
        /* ignore */
      }
      navigate(`/assessments/results/${numericAttemptId}`, {
        replace: true,
        state: notice ? { notice } : undefined,
      });
    },
    [numericAttemptId, navigate]
  );

  const flush = useCallback(async () => {
    const queued = pendingRef.current;
    const answers = Object.entries(queued).map(([questionId, choiceId]) => ({
      question_id: Number(questionId),
      answer_choice_id: choiceId,
    }));
    if (answers.length === 0) return true;

    setSaveState('saving');
    try {
      const response = await assessmentsAPI.saveAnswers(numericAttemptId, answers);
      answers.forEach((answer) => {
        if (queued[answer.question_id] === answer.answer_choice_id) {
          delete queued[answer.question_id];
        }
      });
      persistPending();
      setSaveState('idle');
      if (response?.remaining_seconds != null) {
        deadlineRef.current = Date.now() + response.remaining_seconds * 1000;
        setSecondsLeft(response.remaining_seconds);
      }
      return true;
    } catch (e) {
      if (e?.details?.code === 'attempt_expired') {
        goToResult('Your time ran out. We scored the answers you submitted.');
        return false;
      }
      setSaveState('unsaved');
      return false;
    }
  }, [numericAttemptId, persistPending, goToResult]);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      flush();
    }, FLUSH_DELAY_MS);
  }, [flush]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setError('');
      try {
        const data = await assessmentsAPI.getAttempt(numericAttemptId);
        if (cancelled) return;

        if (data.status !== 'in_progress') {
          goToResult(
            data.status === 'expired'
              ? 'Your time ran out. We scored the answers you submitted.'
              : undefined
          );
          return;
        }

        const serverSelections = {};
        data.questions.forEach((question) => {
          if (question.selected_answer_choice_id != null) {
            serverSelections[question.question_id] = question.selected_answer_choice_id;
          }
        });

        const queued = readPending(numericAttemptId);
        pendingRef.current = queued;

        const merged = { ...serverSelections };
        Object.entries(queued).forEach(([questionId, choiceId]) => {
          if (choiceId == null) delete merged[Number(questionId)];
          else merged[Number(questionId)] = choiceId;
        });

        setAttempt(data);
        setSelections(merged);

        if (data.remaining_seconds != null) {
          deadlineRef.current = Date.now() + data.remaining_seconds * 1000;
          setSecondsLeft(data.remaining_seconds);
        }

        const firstUnanswered = data.questions.findIndex(
          (question) => merged[question.question_id] == null
        );
        setIndex(firstUnanswered === -1 ? 0 : firstUnanswered);

        if (Object.keys(queued).length > 0) {
          setSaveState('unsaved');
          flush();
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Could not load this attempt');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [numericAttemptId, flush, goToResult]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && !finalizedRef.current) {
        if (flushTimer.current) {
          clearTimeout(flushTimer.current);
          flushTimer.current = null;
        }
        flush();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [flush]);

  useEffect(
    () => () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
    },
    []
  );

  const handleSubmit = useCallback(
    async (auto) => {
      if (submitting || finalizedRef.current) return;
      setSubmitting(true);
      setError('');

      if (flushTimer.current) {
        clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }

      const answers = Object.entries(pendingRef.current).map(([questionId, choiceId]) => ({
        question_id: Number(questionId),
        answer_choice_id: choiceId,
      }));

      try {
        await assessmentsAPI.submit(numericAttemptId, answers);
        goToResult(auto ? 'Time is up. We scored the answers you submitted.' : undefined);
      } catch (e) {
        if (e?.details?.code === 'attempt_expired') {
          goToResult('Your time ran out. We scored the answers you submitted.');
          return;
        }
        setError(e?.message || 'Could not submit this assessment');
      } finally {
        setSubmitting(false);
      }
    },
    [numericAttemptId, submitting, goToResult]
  );

  useEffect(() => {
    if (deadlineRef.current == null) return undefined;

    const tick = () => {
      if (deadlineRef.current == null) return;
      const remaining = Math.round((deadlineRef.current - Date.now()) / 1000);
      setSecondsLeft(remaining);
      if (remaining <= 0 && !finalizedRef.current) handleSubmit(true);
    };

    const interval = setInterval(tick, 1000);
    tick();
    return () => clearInterval(interval);
  }, [attempt?.id, handleSubmit]);

  const onSelect = (questionId, choiceId) => {
    setSelections((previous) => ({ ...previous, [questionId]: choiceId }));
    pendingRef.current = { ...pendingRef.current, [questionId]: choiceId };
    setSaveState('unsaved');
    persistPending();
    scheduleFlush();
  };

  const questions = useMemo(() => attempt?.questions || [], [attempt]);
  const current = questions[index];
  const answeredCount = useMemo(
    () => questions.filter((question) => selections[question.question_id] != null).length,
    [questions, selections]
  );

  if (loading) {
    return (
      <AppPageLayout user={user} onLogout={onLogout} activePage="assessments" maxWidthClass="max-w-3xl">
        <p className="text-gray-500">Loading your assessment…</p>
      </AppPageLayout>
    );
  }

  if (!attempt || !current) {
    return (
      <AppPageLayout user={user} onLogout={onLogout} activePage="assessments" maxWidthClass="max-w-3xl">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error || 'This assessment could not be loaded.'}
        </div>
        <button
          type="button"
          onClick={() => navigate('/assessments')}
          className="mt-4 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back to assessments
        </button>
      </AppPageLayout>
    );
  }

  const progressPercent = questions.length
    ? Math.round((answeredCount / questions.length) * 100)
    : 0;
  const unansweredCount = questions.length - answeredCount;
  const lowOnTime = secondsLeft != null && secondsLeft <= 60;
  const isLast = index === questions.length - 1;

  const onSubmitClick = () => {
    if (unansweredCount > 0) {
      const ok = window.confirm(
        `${unansweredCount} question${unansweredCount === 1 ? '' : 's'} ${
          unansweredCount === 1 ? 'is' : 'are'
        } unanswered and will be marked incorrect. Submit anyway?`
      );
      if (!ok) return;
    }
    handleSubmit(false);
  };

  return (
    <AppPageLayout user={user} onLogout={onLogout} activePage="assessments" maxWidthClass="max-w-3xl">
      <div className="sticky top-0 z-10 -mx-4 mb-6 border-b border-gray-200 bg-gray-50 px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{attempt.assessment_title}</p>
            <p className="text-xs text-gray-500">{`Question ${index + 1} of ${questions.length}`}</p>
          </div>
          <div className="text-right">
            {secondsLeft != null ? (
              <p className={`font-mono text-lg font-bold tabular-nums ${lowOnTime ? 'text-red-600' : 'text-gray-700'}`}>
                {formatClock(secondsLeft)}
              </p>
            ) : (
              <p className="text-xs text-gray-500">No time limit</p>
            )}
            <p className="text-xs text-gray-500">
              {saveState === 'saving'
                ? 'Saving…'
                : saveState === 'unsaved'
                ? 'Saved in this browser'
                : `${answeredCount} of ${questions.length} answered`}
            </p>
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-1.5 rounded-full bg-orange-500 transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        {current.category && (
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">{current.category.name}</p>
        )}
        <h1 className="mt-2 text-lg font-semibold leading-relaxed text-gray-900">{current.prompt}</h1>

        {current.media?.url && (
          <img
            src={current.media.url}
            alt={current.media.alt_text || ''}
            className="mt-4 max-h-80 w-full rounded-lg border border-gray-200 object-contain"
          />
        )}

        <div className="mt-5 space-y-3">
          {current.choices.map((choice, choiceIndex) => {
            const selected = selections[current.question_id] === choice.id;
            return (
              <button
                key={choice.id}
                type="button"
                onClick={() => onSelect(current.question_id, choice.id)}
                aria-pressed={selected}
                className={`flex w-full items-center gap-3 rounded-lg border p-4 text-left transition ${
                  selected
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                    selected ? 'border-orange-500 bg-orange-500 text-white' : 'border-gray-300 text-gray-500'
                  }`}
                >
                  {String.fromCharCode(65 + choiceIndex)}
                </span>
                <span className={`text-gray-900 ${selected ? 'font-semibold' : ''}`}>{choice.body}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIndex(index - 1)}
          disabled={!attempt.allow_back_navigation || index === 0}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:invisible"
        >
          Back
        </button>

        <div className="flex items-center gap-3">
          {!isLast && (
            <button
              type="button"
              onClick={onSubmitClick}
              disabled={submitting}
              className="text-sm font-medium text-gray-500 underline hover:text-gray-700"
            >
              Submit now
            </button>
          )}
          {isLast ? (
            <button
              type="button"
              onClick={onSubmitClick}
              disabled={submitting}
              className="rounded-lg bg-orange-600 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Submit assessment'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex(index + 1)}
              className="rounded-lg bg-orange-600 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-700"
            >
              Next question
            </button>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-gray-500">
        Your answers save as you go. If you close this tab, you can pick up where you left off.
      </p>
    </AppPageLayout>
  );
}
