import assert from 'assert';
import {
  AVAILABLE,
  SCHEDULE_CONFLICT,
  UNAVAILABLE,
  describeScheduleOption,
  formatWorkingDate,
  getClassification,
  getScheduleOptions,
  hasScheduleConflict,
  isScheduleUnavailable,
  scheduleConflictFromError,
  scheduleOptionTitle,
  unavailableReasonText,
} from '../src/utils/scheduleAvailability.js';

const conflictJob = {
  id: 7,
  schedule_availability: {
    classification: SCHEDULE_CONFLICT,
    reason: null,
    options: [
      {
        kind: 'start_after_conflict',
        start_at: '2027-03-15T08:00:00.000Z',
        end_at: '2027-03-26T17:00:00.000Z',
        working_dates: ['2027-03-15', '2027-03-16'],
        unavailable_dates: [],
        days: 10,
        requested_days: 10,
        full_duration: true,
        partial: false,
      },
    ],
  },
};

function testClassificationReaders() {
  assert.equal(getClassification(conflictJob), SCHEDULE_CONFLICT);
  assert.equal(hasScheduleConflict(conflictJob), true);
  assert.equal(isScheduleUnavailable(conflictJob), false);
  assert.equal(getScheduleOptions(conflictJob).length, 1);
}

function testAvailableAndMissingPayloads() {
  const available = { schedule_availability: { classification: AVAILABLE, options: [] } };
  assert.equal(hasScheduleConflict(available), false);
  assert.equal(isScheduleUnavailable(available), false);

  // A job serialized for a company or a logged-out viewer carries no availability at all.
  assert.equal(getClassification({}), null);
  assert.equal(hasScheduleConflict({}), false);
  assert.equal(isScheduleUnavailable(undefined), false);
  assert.deepEqual(getScheduleOptions({}), []);
}

function testUnavailableReasonIsExplained() {
  const blocked = {
    schedule_availability: {
      classification: UNAVAILABLE,
      reason: 'no_alternate_schedule_fits',
      options: [],
    },
  };
  assert.equal(isScheduleUnavailable(blocked), true);
  assert.match(unavailableReasonText(blocked), /no days you could still work/);

  const unknown = {
    schedule_availability: { classification: UNAVAILABLE, reason: 'something_new', options: [] },
  };
  assert.equal(unavailableReasonText(unknown), null);
}

function testOptionTitles() {
  assert.equal(scheduleOptionTitle({ kind: 'start_after_conflict' }), 'Start after your current job');
  assert.equal(
    scheduleOptionTitle({ kind: 'keep_original_end' }),
    'Keep the original end date and work the remaining days'
  );
  assert.equal(scheduleOptionTitle({ kind: 'unknown' }), 'Alternate schedule');
  assert.equal(scheduleOptionTitle(null), 'Alternate schedule');
}

function testOptionDescriptions() {
  const full = describeScheduleOption(conflictJob.schedule_availability.options[0]);
  assert.match(full, /all 10 days/);

  const partial = describeScheduleOption({
    kind: 'keep_original_end',
    start_at: '2027-03-15T08:00:00.000Z',
    end_at: '2027-03-23T17:00:00.000Z',
    days: 7,
    requested_days: 10,
    full_duration: false,
    partial: true,
  });
  assert.match(partial, /7 of the 10 requested days/);
  assert.match(partial, /leaving 3 days uncovered/);
}

// A plain YYYY-MM-DD working date must not be shifted a day by the local timezone.
function testWorkingDateFormattingIsTimezoneStable() {
  const formatted = formatWorkingDate('2027-03-01');
  assert.ok(formatted.includes('1'), `expected day 1 in ${formatted}`);
  assert.ok(formatted.includes('2027'), `expected year 2027 in ${formatted}`);
  assert.equal(formatWorkingDate(''), '');
  assert.equal(formatWorkingDate('not-a-date'), 'not-a-date');
}

function testConflictExtractionFromClaimError() {
  const err = new Error('You already have a job scheduled during part of this job.');
  err.status = 409;
  err.details = {
    error: 'You already have a job scheduled during part of this job.',
    schedule_conflict: true,
    schedule_conflict_details: {
      classification: SCHEDULE_CONFLICT,
      requested_days: 10,
      options: [{ kind: 'start_after_conflict' }],
    },
  };
  const conflict = scheduleConflictFromError(err);
  assert.equal(conflict.classification, SCHEDULE_CONFLICT);
  assert.equal(conflict.requested_days, 10);
  assert.equal(conflict.options.length, 1);
  assert.match(conflict.message, /already have a job scheduled/);

  // Any other claim failure must keep its existing handling.
  const plain = new Error('Job has already been claimed');
  plain.details = { error: 'Job has already been claimed' };
  assert.equal(scheduleConflictFromError(plain), null);
  assert.equal(scheduleConflictFromError(new Error('boom')), null);
}

// An unavailable job reports the conflict but offers nothing to propose.
function testConflictWithNoOptions() {
  const err = new Error('no alternate schedule fits');
  err.details = {
    error: 'This job overlaps an assignment you already have and no alternate schedule fits.',
    schedule_conflict: true,
    schedule_conflict_details: { classification: UNAVAILABLE, options: [] },
  };
  const conflict = scheduleConflictFromError(err);
  assert.deepEqual(conflict.options, []);
  assert.equal(conflict.classification, UNAVAILABLE);
}

testClassificationReaders();
testAvailableAndMissingPayloads();
testUnavailableReasonIsExplained();
testOptionTitles();
testOptionDescriptions();
testWorkingDateFormattingIsTimezoneStable();
testConflictExtractionFromClaimError();
testConflictWithNoOptions();

console.log('scheduleAvailability tests passed');
