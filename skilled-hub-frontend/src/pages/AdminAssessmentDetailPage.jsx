import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import AppFooter from '../components/layout/AppFooter';
import { adminAssessmentsAPI } from '../api/api';
import { TRADE_OPTIONS } from '../constants/trades';

const emptyChoice = () => ({ body: '', correct: false });
const emptyQuestionForm = (categoryId) => ({
  assessment_category_id: categoryId || '',
  prompt: '',
  explanation: '',
  difficulty: 'medium',
  choices: [emptyChoice(), emptyChoice(), emptyChoice(), emptyChoice()],
});

function problemsList(problems) {
  if (!problems || problems.length === 0) return null;
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
      {problems.map((problem) => (
        <li key={problem}>{problem}</li>
      ))}
    </ul>
  );
}

export default function AdminAssessmentDetailPage({ user, onLogout }) {
  const { id } = useParams();
  const [assessment, setAssessment] = useState(null);
  const [version, setVersion] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [categoryForm, setCategoryForm] = useState({ slug: '', name: '', question_count: 5 });
  const [questionForm, setQuestionForm] = useState(emptyQuestionForm(''));
  const [editingQuestionId, setEditingQuestionId] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await adminAssessmentsAPI.get(id);
      setAssessment(data);
      const preferred =
        data.versions?.find((entry) => entry.status === 'draft') ||
        data.versions?.find((entry) => entry.id === data.live_version_id) ||
        data.versions?.[0];
      if (preferred) {
        const full = await adminAssessmentsAPI.getVersion(preferred.id);
        setVersion(full);
        const questionPayload = await adminAssessmentsAPI.listQuestions(preferred.id);
        setQuestions(questionPayload.questions || []);
      } else {
        setVersion(null);
        setQuestions([]);
      }
    } catch (e) {
      setError(e?.message || 'Could not load this assessment');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const editable = version?.editable === true;
  const categories = version?.assessment_categories || [];

  const selectVersion = async (versionId) => {
    setBusy('version');
    try {
      const full = await adminAssessmentsAPI.getVersion(versionId);
      setVersion(full);
      const questionPayload = await adminAssessmentsAPI.listQuestions(versionId);
      setQuestions(questionPayload.questions || []);
    } catch (e) {
      setError(e?.message || 'Could not load version');
    } finally {
      setBusy('');
    }
  };

  const run = async (label, fn) => {
    setBusy(label);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e?.details?.problems?.join?.('\n') || e?.details?.errors?.join?.(', ') || e?.message || 'Request failed');
    } finally {
      setBusy('');
    }
  };

  const onSaveMeta = (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    run('meta', () =>
      adminAssessmentsAPI.update(id, {
        title: form.get('title'),
        description: form.get('description'),
        trade_type: form.get('trade_type') || null,
        public_result_rule: form.get('public_result_rule'),
        active: form.get('active') === 'on',
        company_disclaimer: form.get('company_disclaimer') || null,
      })
    );
  };

  const onSaveVersion = (e) => {
    e.preventDefault();
    if (!version) return;
    const form = new FormData(e.target);
    run('rules', () =>
      adminAssessmentsAPI.updateVersion(version.id, {
        instructions: form.get('instructions'),
        time_limit_minutes: form.get('time_limit_minutes') || null,
        passing_score: form.get('passing_score') || null,
        max_attempts: form.get('max_attempts') || null,
        retake_wait_hours: form.get('retake_wait_hours') || null,
        scoring_strategy: form.get('scoring_strategy'),
        allow_resume: form.get('allow_resume') === 'on',
        allow_back_navigation: form.get('allow_back_navigation') === 'on',
        randomize_questions: form.get('randomize_questions') === 'on',
        randomize_answer_choices: form.get('randomize_answer_choices') === 'on',
      })
    );
  };

  const onCreateCategory = (e) => {
    e.preventDefault();
    if (!version) return;
    run('category', async () => {
      await adminAssessmentsAPI.createCategory(version.id, categoryForm);
      setCategoryForm({ slug: '', name: '', question_count: 5 });
    });
  };

  const onSaveQuestion = (e) => {
    e.preventDefault();
    if (!version) return;
    const payload = {
      ...questionForm,
      assessment_category_id: Number(questionForm.assessment_category_id),
      choices: questionForm.choices.filter((choice) => choice.body.trim()),
    };
    run('question', async () => {
      if (editingQuestionId) {
        await adminAssessmentsAPI.updateQuestion(editingQuestionId, payload);
      } else {
        await adminAssessmentsAPI.createQuestion(version.id, payload);
      }
      setQuestionForm(emptyQuestionForm(payload.assessment_category_id));
      setEditingQuestionId(null);
    });
  };

  const startEditQuestion = (question) => {
    setEditingQuestionId(question.id);
    setQuestionForm({
      assessment_category_id: question.assessment_category_id,
      prompt: question.prompt,
      explanation: question.explanation || '',
      difficulty: question.difficulty || 'medium',
      choices: (question.choices || []).map((choice) => ({ body: choice.body, correct: !!choice.correct })),
    });
  };

  const onImport = async (dryRun) => {
    setBusy(dryRun ? 'dry' : 'import');
    setError('');
    setImportResult(null);
    try {
      const document = JSON.parse(importText);
      const result = await adminAssessmentsAPI.import(document, { dryRun });
      setImportResult(result);
      if (!dryRun) await load();
    } catch (e) {
      setError(e?.details?.problems?.join?.('\n') || e?.message || 'Import failed');
    } finally {
      setBusy('');
    }
  };

  const questionCountByCategory = useMemo(() => {
    const counts = {};
    questions.forEach((question) => {
      counts[question.assessment_category_id] = (counts[question.assessment_category_id] || 0) + 1;
    });
    return counts;
  }, [questions]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader user={user} onLogout={onLogout} activePage="assessments" emailVariant="crm" />
        <p className="p-8 text-gray-500">Loading assessment…</p>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader user={user} onLogout={onLogout} activePage="assessments" emailVariant="crm" />
        <div className="p-8">
          <p className="text-red-700">{error || 'Assessment not found.'}</p>
          <Link to="/admin/assessments" className="mt-3 inline-block text-blue-700">
            Back to assessments
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} onLogout={onLogout} activePage="assessments" emailVariant="crm" />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 pb-24">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link to="/admin/assessments" className="text-sm text-blue-700 hover:text-blue-900">
              ← All assessments
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">{assessment.title}</h1>
            <p className="font-mono text-xs text-gray-500">{assessment.slug}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {version && (
              <>
                <button
                  type="button"
                  disabled={busy !== ''}
                  onClick={() =>
                    run('clone', async () => {
                      const cloned = await adminAssessmentsAPI.cloneVersion(version.id);
                      await selectVersion(cloned.id);
                    })
                  }
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium"
                >
                  Clone to new draft
                </button>
                {version.status === 'draft' && (
                  <button
                    type="button"
                    disabled={busy !== ''}
                    onClick={() => run('publish', () => adminAssessmentsAPI.publishVersion(version.id))}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
                  >
                    Publish version
                  </button>
                )}
                {version.status === 'published' && (
                  <button
                    type="button"
                    disabled={busy !== ''}
                    onClick={() => run('retire', () => adminAssessmentsAPI.retireVersion(version.id))}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
                  >
                    Retire version
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {error && (
          <pre className="whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </pre>
        )}

        <form onSubmit={onSaveMeta} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Assessment</h2>
          <input name="title" defaultValue={assessment.title} className="w-full rounded-lg border px-3 py-2 text-sm" />
          <textarea
            name="description"
            defaultValue={assessment.description || ''}
            rows={2}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Technician-facing description"
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <select name="trade_type" defaultValue={assessment.trade_type || ''} className="rounded-lg border px-3 py-2 text-sm">
              <option value="">No recommended trade</option>
              {TRADE_OPTIONS.map((trade) => (
                <option key={trade} value={trade}>
                  {trade}
                </option>
              ))}
            </select>
            <select
              name="public_result_rule"
              defaultValue={assessment.public_result_rule}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <option value="best_valid">Companies see best score</option>
              <option value="latest_valid">Companies see latest score</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" name="active" defaultChecked={assessment.active} />
              Active in catalog
            </label>
          </div>
          <textarea
            name="company_disclaimer"
            defaultValue={assessment.company_disclaimer || ''}
            rows={2}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Optional company disclaimer override"
          />
          <button type="submit" className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white">
            Save assessment
          </button>
        </form>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Versions</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {(assessment.versions || []).map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => selectVersion(entry.id)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  version?.id === entry.id
                    ? 'border-blue-600 bg-blue-50 text-blue-800'
                    : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                {`v${entry.version_number} · ${entry.status}`}
              </button>
            ))}
          </div>
          {version && (
            <p className="mt-2 text-xs text-gray-500">
              {editable
                ? 'This draft is editable. Publishing freezes its content forever; later edits require a clone.'
                : 'This version is immutable. Clone it to a new draft to change questions or rules.'}
            </p>
          )}
          {version && problemsList(version.publication_problems)}
        </section>

        {version && (
          <form onSubmit={onSaveVersion} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">{`Rules · v${version.version_number}`}</h2>
            <textarea
              name="instructions"
              defaultValue={version.instructions || ''}
              disabled={!editable}
              rows={2}
              className="w-full rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50"
              placeholder="Instructions shown before the first question"
            />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <LabeledInput name="time_limit_minutes" label="Time limit (min)" defaultValue={version.time_limit_minutes} disabled={!editable} />
              <LabeledInput name="passing_score" label="Passing score" defaultValue={version.passing_score} disabled={!editable} />
              <LabeledInput name="max_attempts" label="Max attempts" defaultValue={version.max_attempts} disabled={!editable} />
              <LabeledInput name="retake_wait_hours" label="Retake wait (hours)" defaultValue={version.retake_wait_hours} disabled={!editable} />
            </div>
            <select
              name="scoring_strategy"
              defaultValue={version.scoring_strategy}
              disabled={!editable}
              className="rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50"
            >
              <option value="normalized_percent">Normalized percent</option>
              <option value="category_weighted">Category weighted</option>
            </select>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="allow_resume" defaultChecked={version.allow_resume} disabled={!editable} />
                Allow resume
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="allow_back_navigation" defaultChecked={version.allow_back_navigation} disabled={!editable} />
                Allow back navigation
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="randomize_questions" defaultChecked={version.randomize_questions} disabled={!editable} />
                Randomize questions
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="randomize_answer_choices" defaultChecked={version.randomize_answer_choices} disabled={!editable} />
                Randomize choices
              </label>
            </div>
            {editable && (
              <button type="submit" className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white">
                Save rules
              </button>
            )}
          </form>
        )}

        {version && (
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Categories</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="py-2">Name</th>
                    <th>Blueprint</th>
                    <th>Bank</th>
                    <th>Usable</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => (
                    <tr key={category.id} className="border-t">
                      <td className="py-2">
                        <p className="font-medium">{category.name}</p>
                        <p className="font-mono text-xs text-gray-500">{category.slug}</p>
                      </td>
                      <td>{category.question_count}</td>
                      <td>{category.bank_size}</td>
                      <td className={category.bank_sufficient ? 'text-emerald-700' : 'text-amber-700'}>
                        {category.usable_bank_size}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {editable && (
              <form onSubmit={onCreateCategory} className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-4">
                <input
                  required
                  className="rounded-lg border px-3 py-2 text-sm"
                  placeholder="Name"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))}
                />
                <input
                  required
                  className="rounded-lg border px-3 py-2 text-sm font-mono"
                  placeholder="slug"
                  value={categoryForm.slug}
                  onChange={(e) => setCategoryForm((f) => ({ ...f, slug: e.target.value }))}
                />
                <input
                  type="number"
                  min="1"
                  className="rounded-lg border px-3 py-2 text-sm"
                  value={categoryForm.question_count}
                  onChange={(e) => setCategoryForm((f) => ({ ...f, question_count: Number(e.target.value) }))}
                />
                <button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
                  Add category
                </button>
              </form>
            )}
          </section>
        )}

        {version && (
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">
              {`Question bank (${questions.length})`}
            </h2>
            {editable && (
              <form onSubmit={onSaveQuestion} className="mt-3 space-y-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                <select
                  required
                  className="rounded-lg border px-3 py-2 text-sm"
                  value={questionForm.assessment_category_id}
                  onChange={(e) => setQuestionForm((f) => ({ ...f, assessment_category_id: e.target.value }))}
                >
                  <option value="">Category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <textarea
                  required
                  rows={3}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="Question prompt"
                  value={questionForm.prompt}
                  onChange={(e) => setQuestionForm((f) => ({ ...f, prompt: e.target.value }))}
                />
                <textarea
                  rows={2}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="Explanation shown after submit"
                  value={questionForm.explanation}
                  onChange={(e) => setQuestionForm((f) => ({ ...f, explanation: e.target.value }))}
                />
                {questionForm.choices.map((choice, index) => (
                  <label key={index} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct_choice"
                      checked={choice.correct}
                      onChange={() =>
                        setQuestionForm((f) => ({
                          ...f,
                          choices: f.choices.map((item, i) => ({ ...item, correct: i === index })),
                        }))
                      }
                    />
                    <input
                      className="flex-1 rounded-lg border px-3 py-2 text-sm"
                      placeholder={`Choice ${String.fromCharCode(65 + index)}`}
                      value={choice.body}
                      onChange={(e) =>
                        setQuestionForm((f) => ({
                          ...f,
                          choices: f.choices.map((item, i) =>
                            i === index ? { ...item, body: e.target.value } : item
                          ),
                        }))
                      }
                    />
                  </label>
                ))}
                <div className="flex gap-2">
                  <button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
                    {editingQuestionId ? 'Update question' : 'Add question'}
                  </button>
                  {editingQuestionId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingQuestionId(null);
                        setQuestionForm(emptyQuestionForm(categories[0]?.id || ''));
                      }}
                      className="rounded-lg border px-3 py-2 text-sm"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            )}
            <ul className="mt-4 divide-y">
              {questions.map((question) => (
                <li key={question.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{question.prompt}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {`${question.category_slug || 'uncategorized'} · ${question.difficulty} · ${
                          question.choices?.length || 0
                        } choices`}
                      </p>
                    </div>
                    {editable && (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => startEditQuestion(question)} className="text-xs text-blue-700">
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => run('delete-q', () => adminAssessmentsAPI.destroyQuestion(question.id))}
                          className="text-xs text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {categories.length > 0 && (
              <p className="mt-3 text-xs text-gray-500">
                {categories
                  .map(
                    (category) =>
                      `${category.name}: ${questionCountByCategory[category.id] || 0} in bank / ${category.question_count} drawn`
                  )
                  .join(' · ')}
              </p>
            )}
          </section>
        )}

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Import question bank (JSON)</h2>
          <p className="mt-1 text-xs text-gray-500">
            Dry-run first. Re-importing a published version is refused unless the document sets
            version.on_published to new_version.
          </p>
          <textarea
            className="mt-3 h-40 w-full rounded-lg border px-3 py-2 font-mono text-xs"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='{"assessment":{"slug":"..."},"version":{"publish":false},"categories":[...]}'
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy !== ''}
              onClick={() => onImport(true)}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              Dry run
            </button>
            <button
              type="button"
              disabled={busy !== ''}
              onClick={() => onImport(false)}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Import
            </button>
          </div>
          {importResult && (
            <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
              {JSON.stringify(
                { published: importResult.published, dry_run: importResult.dry_run, stats: importResult.stats, problems: importResult.problems },
                null,
                2
              )}
            </pre>
          )}
        </section>
      </main>
      <AppFooter />
    </div>
  );
}

function LabeledInput({ name, label, defaultValue, disabled }) {
  return (
    <label className="text-xs text-gray-600">
      {label}
      <input
        name={name}
        defaultValue={defaultValue ?? ''}
        disabled={disabled}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50"
      />
    </label>
  );
}
