import assert from 'assert';
import {
  buildTierUpdatePayload,
  defaultAdditionalFeatures,
  rowFromTier,
} from '../src/components/admin/adminJobAccessSettingsState.js';

function testRowFromTierMapsBackendFields() {
  const row = rowFromTier({
    id: 12,
    slug: 'pro',
    display_name: 'Pro',
    early_access_delay_hours: 24,
    job_access_min_experience_years: 3,
    job_access_min_jobs_completed: 9,
    job_access_min_successful_jobs: 4,
    job_access_min_profile_completeness_percent: 75,
    job_access_requires_verified_background: true,
  });

  assert.strictEqual(row.accessAfterLiveHours, '24');
  assert.strictEqual(row.additionalFeatures.minimumExperienceYears, '3');
  assert.strictEqual(row.additionalFeatures.minimumJobsCompleted, '9');
  assert.strictEqual(row.additionalFeatures.minimumSuccessfulJobs, '4');
  assert.strictEqual(row.additionalFeatures.minimumProfileCompletenessPercent, '75');
  assert.strictEqual(row.additionalFeatures.requiresVerifiedBackground, true);
}

function testBuildTierUpdatePayloadUsesSupportedKeysOnly() {
  const payload = buildTierUpdatePayload({
    accessAfterLiveHours: '48',
    additionalFeatures: {
      minimumExperienceYears: '5',
      minimumJobsCompleted: '100',
      minimumSuccessfulJobs: '70',
      minimumProfileCompletenessPercent: '120',
      requiresVerifiedBackground: true,
    },
  });

  assert.deepStrictEqual(payload, {
    early_access_delay_hours: 48,
    job_access_min_experience_years: 5,
    job_access_min_jobs_completed: 100,
    job_access_min_successful_jobs: 70,
    job_access_min_profile_completeness_percent: 100,
    job_access_requires_verified_background: true,
  });
}

function testDefaultsAreSafe() {
  const defaults = defaultAdditionalFeatures();
  assert.strictEqual(defaults.minimumExperienceYears, '0');
  assert.strictEqual(defaults.requiresVerifiedBackground, false);
}

function run() {
  testRowFromTierMapsBackendFields();
  testBuildTierUpdatePayloadUsesSupportedKeysOnly();
  testDefaultsAreSafe();
  // eslint-disable-next-line no-console
  console.log('job access settings tests passed');
}

run();
