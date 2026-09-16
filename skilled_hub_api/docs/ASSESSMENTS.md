# TechFlash Knowledge Assessments

Technician knowledge assessments give employers an extra standardized signal
about trade knowledge.

**A score is not a certification.** It is not a license, not a credential, and
not a guarantee that a technician can safely perform field work. Never label a
technician "certified" based on an assessment. All company-facing copy is
centralized in `Assessments::Disclaimer` so every surface qualifies a score the
same way.

---

## 1. Model overview

| Model | Table | Purpose |
| --- | --- | --- |
| `Assessment` | `assessments` | Stable identity for one trade's assessment. Long-lived. |
| `AssessmentVersion` | `assessment_versions` | Immutable-once-published snapshot of content + rules. |
| `AssessmentCategory` | `assessment_categories` | Reporting/blueprint bucket inside a version. |
| `AssessmentQuestion` | `assessment_questions` | One multiple-choice question in a version's bank. |
| `AssessmentAnswerChoice` | `assessment_answer_choices` | One option; `correct` is answer-key data. |
| `AssessmentAttempt` | `assessment_attempts` | One technician's sitting of one version. |
| `AssessmentAttemptQuestion` | `assessment_attempt_questions` | The attempt's frozen answer sheet. |
| `AssessmentAttemptCategoryResult` | `assessment_attempt_category_results` | Per-category breakdown of a scored attempt. |
| `TechnicianAssessmentResult` | `technician_assessment_results` | Projection of the one result companies see. |

Categories belong to a **version**, not to the assessment. HVAC, Plumbing and
Electrical can therefore each have completely different category sets, and a
version 2 can restructure categories without disturbing version 1 results.

---

## 2. Versioning contract

Results must stay historically meaningful, so published content never changes.

```
draft  ──publish──>  published  ──retire──>  retired
  ▲                      │
  └────── clone ─────────┘   (clone_to_draft mints a new draft version number)
```

* **Draft** — freely editable. No attempts can exist against it.
* **Published** — content and configuration are frozen. This is the version
  technicians are served. Exactly one published version per assessment at a
  time; publishing v2 automatically retires v1.
* **Retired** — no new attempts. Existing attempts and results are untouched.

Enforcement is at the model layer, not only in controllers:

* `AssessmentVersion#published_content_must_not_change` rejects changes to any
  column except `status` / `retired_at` once published.
* `AssessmentContentImmutability` (included by category, question and answer
  choice) rejects create, update and destroy when the owning version is
  published or retired.

To revise published content: clone the version into a draft, edit the draft,
publish it. Prior attempts keep pointing at the version that scored them, and
`TechnicianAssessmentResult` records `assessment_version_id`, so an old score
always reports the version that produced it.

---

## 3. Question randomization

`Assessments::QuestionSelector` runs **server-side only**.

1. Build the usable pool: questions that are `active` **and** have exactly one
   correct choice and at least two choices. Anything a technician could not be
   fairly scored on is excluded.
2. If the version has a blueprint (any category declares `question_count`), draw
   exactly that many from each category's pool. Raises
   `InsufficientQuestions` when a category's bank is too small, so an attempt is
   never created against a version that would run out of questions mid-sitting.
3. Otherwise draw `question_count` from the combined pool.
4. Order the paper: shuffled when `randomize_questions`, otherwise category
   position then question position.
5. Compute each question's choice order: shuffled when
   `randomize_answer_choices`, otherwise canonical position.

Every shuffle is seeded from `SHA256(attempt_seed + salt)` with a distinct salt
per category and per question, so draws are independent but reproducible. The
seed is stored on the attempt (`selection_seed`).

The result is written once to `assessment_attempt_questions` (question id,
`position`, `choice_order`). **An attempt is never re-randomized.** Resuming
replays the stored paper, including answer-choice order, so the same paper
appears on any device.

Bank size is expected to exceed paper size — a 100-question HVAC bank serving a
40-question paper is the intended shape.

---

## 4. Scoring

`Assessments::Scorer` is pure calculation and never writes. Scoring happens
only on the server; the client never receives answer-key data.

* **Overall score**: 0–100 normalized, so scores are comparable across
  assessments that serve different question counts.
  * `normalized_percent` (default): `correct / total * 100`
  * `category_weighted`: weighted mean of category percentages using each
    category's `weight`
* **Category score**: `correct / questions_in_category * 100`, rounded.
* **Unanswered questions count as incorrect.** A half-finished paper yields an
  honest low score rather than inflated partial credit.
* **Score band** is resolved from the bands captured in the attempt's
  `config_snapshot`, not from current configuration.

Both the numeric score and the resolved band slug/label are stored on the
attempt, so changing thresholds later cannot rewrite historical results.

### Score bands

Stored as JSON on `assessment_versions.score_bands`. Optional; when present they
must tile 0–100 exactly (no gaps, no overlaps), so every score resolves to one
band. `Assessments::ScoreBands::STARTER_TEMPLATE` is the provisional default
used by the importer when a document omits bands — final labels and thresholds
are decided per assessment.

---

## 5. Attempts

`assessment_attempts.status`: `in_progress` (0), `completed` (1), `expired` (2).
"Not started" is the absence of an attempt, not a stored row.

* **Resumable by default.** `allow_resume` defaults to true. Starting an
  assessment that already has a live attempt returns that attempt instead of
  creating a second one or consuming an attempt allowance.
* **Duplicate-safe.** A partial unique index on
  `(technician_profile_id, assessment_id) WHERE status = 0` means two concurrent
  start requests cannot both create an attempt; the loser resumes the winner's.
  `SubmitAttempt` takes a row lock and re-checks status, so a repeated submit
  returns the already-scored attempt untouched.
* **Autosave.** Clients `PATCH .../answers` as the technician goes, so an
  attempt survives the app being backgrounded, killed, or losing connectivity.
  Saves are idempotent and order-independent.
* **Expiry.** Applied lazily on read/write paths by
  `Assessments::AttemptExpirer`, so a client returning after the time limit gets
  a clean expired result immediately. An expired attempt is **scored on what was
  answered** rather than discarded. `rake assessments:expire_attempts` is
  housekeeping only; correctness does not depend on it.

---

## 6. Retakes and the company-facing result

`Assessments::RetakePolicy` evaluates, in order: an existing live attempt
(resume), `max_attempts` (nil = unlimited), then `retake_wait_hours`
(nil/0 = no wait). With both unset — the expected launch configuration — a
retake is always allowed. Attempts are counted across every version of an
assessment, so publishing version 2 does not hand out a fresh allowance.

Technicians see their **full attempt history** via
`GET /api/v1/assessment_attempts`.

Companies see only the **designated public result** from
`technician_assessment_results` — never history, never a low earlier attempt.
`Assessment#public_result_rule` selects it:

* `best_valid` (launch default) — highest score, ties broken by recency
* `latest_valid` — most recently completed scored attempt

`Assessments::PublicResultProjector` rebuilds the projection whenever an attempt
finishes. Switching an assessment's rule recomputes existing projections
automatically (see `Admin::AssessmentsController#update`).

---

## 7. Security model

| Actor | Allowed | Denied |
| --- | --- | --- |
| Technician | Take their own assessments; see their own full results, history and post-submission review | Cannot alter scores (no score/status/correct field is writable via any technician endpoint); cannot retrieve answer keys; cannot reach another technician's attempt (404, so ids are not enumerable) |
| Company | The designated public result for technicians they can view, with disclaimer | No answer keys, no attempt history, no in-progress data |
| Admin | Full content management under existing `require_admin` | Cannot mutate published content (immutability applies to admins too) |

`AssessmentAnswerChoiceSerializer` — the **default** serializer for the model —
omits `correct`. `Admin::AssessmentAnswerChoiceSerializer` is the single
explicit opt-in that exposes it, reachable only from `require_admin`
controllers. `AssessmentAttemptSerializer` also withholds `explanation` during
an attempt, because an explanation describes the correct answer.

---

## 8. Profile completeness / job readiness

Assessments are **optional and additive**.

`MembershipPolicy.technician_profile_completeness_percent` — which gates job
access — is deliberately **unchanged**. Adding a new required field there would
instantly drop every existing technician's completeness and could make them
ineligible for jobs they qualify for today.

Instead, `TechnicianProfileStrength` provides an informational score
(`profile_strength` on `GET /api/v1/technicians/profile`) where completing an
assessment adds 15%. `Assessments::ProfileContribution` reports the assessment
state (`not_started` / `in_progress` / `completed`) and always returns
`counts_toward_job_access: false`. Nothing here can make a technician ineligible
for anything.

---

## 9. Analytics

Attempts and results are stored relationally and join cleanly to performance
data for later validation of whether scores predict successful work:

* `assessment_attempts.user_id` and `.technician_profile_id` reach `users`,
  `job_applications`, `jobs`, `ratings`, `time_entries` and
  `job_counter_offers` in one hop.
* `assessment_attempt_category_results` gives indexed per-category scores.
* `technician_assessment_results` gives one row per technician per assessment
  with `score`, `score_band_slug`, `best_score`, `latest_score` and
  `attempts_count`.

No predictive model is built. The data shape simply does not block one.

---

## 10. Content import format

The supported way to add a question bank. One JSON document per assessment,
placed in `db/assessment_seeds/`.

```
bin/rails assessments:validate FILE=db/assessment_seeds/hvac_knowledge.json  # dry run
bin/rails assessments:import   FILE=db/assessment_seeds/hvac_knowledge.json
bin/rails assessments:import_seeds                                           # whole directory
bin/rails assessments:schema                                                 # print this example
```

`db/assessment_seeds/EXAMPLE.json` is a complete working document and is
skipped by `import_seeds`. The same contract is served by
`GET /api/v1/admin/assessment_imports/schema` and accepted by
`POST /api/v1/admin/assessment_imports` (with `dry_run`).

### Document shape

```json
{
  "assessment": {
    "slug": "hvac_knowledge",
    "title": "HVAC Knowledge Assessment",
    "description": "Test your HVAC knowledge and add your score to your TechFlash profile.",
    "trade_type": "HVAC Technician",
    "company_disclaimer": null,
    "active": true,
    "position": 1,
    "public_result_rule": "best_valid"
  },
  "version": {
    "version_number": 1,
    "publish": true,
    "instructions": "Answer each question to the best of your knowledge.",
    "time_limit_minutes": 30,
    "passing_score": null,
    "max_attempts": null,
    "retake_wait_hours": null,
    "randomize_questions": true,
    "randomize_answer_choices": true,
    "allow_resume": true,
    "allow_back_navigation": true,
    "scoring_strategy": "normalized_percent",
    "score_bands": [
      { "slug": "foundational",        "label": "Foundational",        "min_score": 0,  "max_score": 39 },
      { "slug": "developing",          "label": "Developing",          "min_score": 40, "max_score": 59 },
      { "slug": "apprentice",          "label": "Apprentice",          "min_score": 60, "max_score": 74 },
      { "slug": "advanced_apprentice", "label": "Advanced Apprentice", "min_score": 75, "max_score": 89 },
      { "slug": "strong_knowledge",    "label": "Strong Knowledge",    "min_score": 90, "max_score": 100 }
    ]
  },
  "categories": [
    {
      "slug": "safety_and_tools",
      "name": "Safety & Tools",
      "description": "Jobsite safety practices and correct tool selection.",
      "question_count": 10,
      "weight": 1.0,
      "questions": [
        {
          "external_key": "hvac_v1_safety_001",
          "prompt": "Which item must be de-energized and verified before servicing a unit?",
          "explanation": "Always verify the circuit is de-energized with a meter before servicing.",
          "difficulty": "easy",
          "active": true,
          "media_url": null,
          "media_type": null,
          "media_alt_text": null,
          "choices": [
            { "key": "a", "body": "The line-voltage supply circuit", "correct": true },
            { "key": "b", "body": "The thermostat display",          "correct": false },
            { "key": "c", "body": "The condensate drain",            "correct": false },
            { "key": "d", "body": "The filter rack",                 "correct": false }
          ]
        }
      ]
    }
  ]
}
```

### Field reference

**`assessment`** (required: `slug`, `title`)

| Field | Notes |
| --- | --- |
| `slug` | Lowercase letters, numbers, underscores. Stable identity — the import key. |
| `trade_type` | Must be a `TradeCatalog::OPTIONS` label (e.g. `"HVAC Technician"`, `"Plumber"`, `"Electrician"`). Drives trade-based recommendation. |
| `company_disclaimer` | Optional override of the default company-facing wording. |
| `public_result_rule` | `best_valid` or `latest_valid`. |
| `position` | Display order in the technician catalog. |

**`version`** (all optional; sensible defaults apply)

| Field | Default | Notes |
| --- | --- | --- |
| `version_number` | next available | Targets an existing draft, or creates it. |
| `publish` | `false` | Publishes after import. Fails the import if the version is not publishable. |
| `time_limit_minutes` | `null` | `null` = untimed. |
| `passing_score` | `null` | `null` = benchmark only, no pass/fail. |
| `max_attempts` | `null` | `null` = unlimited. |
| `retake_wait_hours` | `null` | `null`/`0` = no waiting period. |
| `randomize_questions` / `randomize_answer_choices` | `true` | |
| `allow_resume` / `allow_back_navigation` | `true` | |
| `scoring_strategy` | `normalized_percent` | Or `category_weighted`. |
| `score_bands` | starter template | Must tile 0–100 exactly. |
| `on_published` | — | Set to `"new_version"` to clone a published version into a draft instead of failing. |

**`categories[]`** (required: `slug`, `name`)

| Field | Notes |
| --- | --- |
| `question_count` | **Blueprint**: how many questions this category contributes to every attempt. The sum across categories becomes the version's `question_count`. |
| `weight` | Only used by `category_weighted` scoring. Default `1.0`. |
| `questions[]` | The bank. Supply **more** than `question_count` so attempts genuinely randomize. |

**`questions[]`** (required: `prompt`, `choices`)

| Field | Notes |
| --- | --- |
| `external_key` | Strongly recommended. Unique within the version; makes re-import idempotent (updates in place instead of duplicating). |
| `difficulty` | `easy`, `medium` or `hard`. Default `medium`. |
| `explanation` | Shown only in post-submission review, never during an attempt. |
| `media_url` / `media_type` / `media_alt_text` | Reserved for image-based questions. Not required now; no schema change needed to start using them. |
| `choices[]` | At least 2, **exactly one** with `"correct": true`. `key` is an authoring label stored as `external_key`. |

### Import behaviour

* **Idempotent.** Re-importing updates the draft in place, matching questions by
  `external_key`. Questions absent from a re-import are **deactivated**, not
  deleted.
* **Never mutates published content.** Importing into a published version is
  refused unless `"on_published": "new_version"`.
* **All-or-nothing.** Validation runs first and everything happens in one
  transaction, so a partially valid file cannot half-load.
* **Choices are replaced wholesale** per question, keeping the stored answer key
  exactly equal to the document.

### Checklist for adding the HVAC / Plumbing / Electrical banks

1. One file per assessment in `db/assessment_seeds/` (e.g. `hvac_knowledge.json`).
2. Set `trade_type` to the matching `TradeCatalog` label so recommendation works.
3. Define each assessment's own categories — they need not match across trades.
4. Blueprint `question_count` per category summing to ~40; supply a larger bank
   (e.g. ~100 questions) so randomization is meaningful.
5. Give every question a unique `external_key` prefixed by assessment + version.
6. Exactly one correct choice per question.
7. Confirm or override `score_bands`.
8. `bin/rails assessments:validate FILE=...`, then import with
   `"publish": true`.

No engine code needs to change.

---

## 11. API surface

### Technician

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/assessments` | Catalog with per-assessment state, recommendation and eligibility |
| `GET` | `/api/v1/assessments/:id_or_slug` | One assessment's detail |
| `POST` | `/api/v1/assessments/:assessment_id/attempts` | Start or resume (idempotent) |
| `GET` | `/api/v1/assessment_attempts` | Own attempt history |
| `GET` | `/api/v1/assessment_attempts/:id` | Live paper, or scored result with review |
| `PATCH` | `/api/v1/assessment_attempts/:id/answers` | Autosave answers |
| `POST` | `/api/v1/assessment_attempts/:id/submit` | Submit and score (duplicate-safe) |

### Company

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/technicians/:id/assessment_results` | Designated public results + disclaimer |
| `GET` | `/api/v1/technicians/:id` | Profile payload includes `assessment_results` |
| `GET` | `/api/v1/technicians?...` | Filters: `assessment_completed`, `min_assessment_score`, `assessment_band`, `assessment_slug`, `assessment_trade`, `assessment_category_slug` + `min_assessment_category_score` |

### Admin (all `require_admin`)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET`/`POST` | `/api/v1/admin/assessments` | List / create (creates draft v1) |
| `GET`/`PATCH`/`DELETE` | `/api/v1/admin/assessments/:id` | Detail / update / delete (blocked once attempts exist) |
| `GET`/`POST` | `/api/v1/admin/assessments/:assessment_id/versions` | List / create (optionally from `source_version_id`) |
| `GET`/`PATCH`/`DELETE` | `/api/v1/admin/assessment_versions/:id` | Detail / update draft / delete |
| `POST` | `/api/v1/admin/assessment_versions/:id/publish` | Validate and publish |
| `POST` | `/api/v1/admin/assessment_versions/:id/retire` | Stop new attempts |
| `POST` | `/api/v1/admin/assessment_versions/:id/clone` | Clone to a new draft |
| `GET`/`POST` | `/api/v1/admin/assessment_versions/:id/categories` | Blueprint categories |
| `PATCH`/`DELETE` | `/api/v1/admin/assessment_categories/:id` | Edit / remove |
| `GET`/`POST` | `/api/v1/admin/assessment_versions/:id/questions` | Question bank (with answer keys) |
| `GET`/`PATCH`/`DELETE` | `/api/v1/admin/assessment_questions/:id` | Edit question + choices |
| `POST` | `/api/v1/admin/assessment_imports` | Import a document (`dry_run` supported) |
| `GET` | `/api/v1/admin/assessment_imports/schema` | This contract, machine-readable |

---

## 12. Notifications

`Assessments::AssessmentEventNotifier` creates `AppNotification` rows with
category `"assessment"`, following the `VerificationEventNotifier` pattern
(failures are logged and swallowed so a notification problem never breaks the
flow that triggered it).

* **Assessment completed** — on submit, with score and level.
* **Attempt expired** — when a timed attempt runs out, stating it was scored on
  submitted answers.
* **Retake available** — only for assessments with `retake_wait_hours`, via
  `rake assessments:notify_retakes`.

No email or SMS channel is added; results are not time-critical.

---

## 13. Maintenance tasks

| Task | Purpose |
| --- | --- |
| `assessments:import FILE=` | Import one document |
| `assessments:validate FILE=` | Dry-run validate one document |
| `assessments:import_seeds` | Import `db/assessment_seeds/*.json` (`DRY_RUN=1` to validate) |
| `assessments:schema` | Print the import example |
| `assessments:expire_attempts` | Housekeeping sweep of timed-out attempts |
| `assessments:notify_retakes` | Retake-available notifications |
| `assessments:rebuild_results` | Rebuild the public result projection |
