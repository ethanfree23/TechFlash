import assert from 'assert';
import {
  addDays,
  applyQuickSelect,
  buildMonthGrid,
  buildWallDateTime,
  clampHour12,
  clampMinute,
  compareDateKeys,
  dateKeyFromOffset,
  defaultDraftParts,
  formatDateKey,
  getZonedParts,
  hour12To24,
  hour24To12,
  initialDraftFromValue,
  isDateBeforeToday,
  nextMondayDateKey,
  parseWallDateTime,
  shiftMonth,
  todayDateKey,
} from '../src/utils/dateTimePicker.js';

function testParseAndBuildRoundTrip() {
  assert.deepEqual(parseWallDateTime('2026-10-21T08:00'), {
    date: '2026-10-21',
    hour: 8,
    minute: 0,
    ampm: 'AM',
  });
  assert.deepEqual(parseWallDateTime('2026-10-21T17:30'), {
    date: '2026-10-21',
    hour: 5,
    minute: 30,
    ampm: 'PM',
  });
  assert.deepEqual(parseWallDateTime('2026-10-21T00:05'), {
    date: '2026-10-21',
    hour: 12,
    minute: 5,
    ampm: 'AM',
  });
  assert.deepEqual(parseWallDateTime('2026-10-21T12:00'), {
    date: '2026-10-21',
    hour: 12,
    minute: 0,
    ampm: 'PM',
  });

  assert.equal(buildWallDateTime('2026-10-21', 8, 0, 'AM'), '2026-10-21T08:00');
  assert.equal(buildWallDateTime('2026-10-21', 10, 30, 'AM'), '2026-10-21T10:30');
  assert.equal(buildWallDateTime('2026-10-21', 12, 0, 'AM'), '2026-10-21T00:00');
  assert.equal(buildWallDateTime('2026-10-21', 12, 0, 'PM'), '2026-10-21T12:00');
  assert.equal(buildWallDateTime('2026-10-21', 5, 45, 'PM'), '2026-10-21T17:45');
  assert.equal(buildWallDateTime('', 8, 0, 'AM'), '');
}

function testHourMinuteClamps() {
  assert.equal(clampHour12(0), 1);
  assert.equal(clampHour12(13), 12);
  assert.equal(clampHour12('9'), 9);
  assert.equal(clampMinute(-1), 0);
  assert.equal(clampMinute(60), 59);
  assert.equal(clampMinute('7'), 7);
  assert.equal(hour12To24(8, 'AM'), 8);
  assert.equal(hour12To24(8, 'PM'), 20);
  assert.deepEqual(hour24To12(0), { hour: 12, ampm: 'AM' });
  assert.deepEqual(hour24To12(13), { hour: 1, ampm: 'PM' });
}

function testDefaultIsTomorrowAt8Am() {
  // Fixed instant: Oct 20, 2026 15:00 UTC → in America/Chicago still Oct 20.
  const now = new Date('2026-10-20T15:00:00.000Z');
  const draft = defaultDraftParts(now, 'America/Chicago');
  assert.deepEqual(draft, {
    date: '2026-10-21',
    hour: 8,
    minute: 0,
    ampm: 'AM',
  });
  assert.equal(buildWallDateTime(draft.date, draft.hour, draft.minute, draft.ampm), '2026-10-21T08:00');
}

function testDefaultUsesJobTimezoneAcrossDateLine() {
  // Oct 20 2026 05:00 UTC is still Oct 19 evening in America/Los_Angeles,
  // so "tomorrow" there is Oct 20 — not Oct 21.
  const now = new Date('2026-10-20T05:00:00.000Z');
  const la = defaultDraftParts(now, 'America/Los_Angeles');
  assert.equal(la.date, '2026-10-20');

  const tokyo = defaultDraftParts(now, 'Asia/Tokyo');
  assert.equal(tokyo.date, '2026-10-21');
}

function testExistingValueReopensExactly() {
  const value = '2026-11-03T10:30';
  const draft = initialDraftFromValue(value, {
    now: new Date('2026-10-20T15:00:00.000Z'),
    timeZone: 'America/Chicago',
  });
  assert.deepEqual(draft, {
    date: '2026-11-03',
    hour: 10,
    minute: 30,
    ampm: 'AM',
  });
}

function testEmptyValueUsesDefaultNotSaved() {
  const draft = initialDraftFromValue('', {
    now: new Date('2026-10-20T15:00:00.000Z'),
    timeZone: 'America/Chicago',
  });
  assert.equal(draft.date, '2026-10-21');
  assert.equal(draft.hour, 8);
  assert.equal(draft.ampm, 'AM');
  // Caller must Apply — utility never mutates an external store.
}

function testQuickSelectsAndMonthRollover() {
  const now = new Date('2026-10-30T18:00:00.000Z'); // Oct 30 Chicago afternoon
  const base = { date: '2026-10-30', hour: 8, minute: 0, ampm: 'AM' };

  const tomorrow = applyQuickSelect('tomorrow', base, { now, timeZone: 'America/Chicago' });
  assert.equal(tomorrow.date, '2026-10-31');

  const in3 = applyQuickSelect('in_3_days', base, { now, timeZone: 'America/Chicago' });
  assert.equal(in3.date, '2026-11-02'); // month rollover

  // Oct 30 2026 is a Friday → next Monday is Nov 2
  const monday = applyQuickSelect('next_monday', base, { now, timeZone: 'America/Chicago' });
  assert.equal(monday.date, '2026-11-02');
  assert.equal(monday.hour, 8); // preserves draft time
}

function testNextMondayWhenTodayIsMonday() {
  // 2026-10-19 is a Monday in Chicago.
  const now = new Date('2026-10-19T17:00:00.000Z');
  assert.equal(nextMondayDateKey(now, 'America/Chicago'), '2026-10-26');
}

function testMonthGridAndShift() {
  const grid = buildMonthGrid(2026, 10);
  assert.equal(grid.length, 42);
  const firstInMonth = grid.find((c) => c.inMonth);
  assert.equal(firstInMonth.key, '2026-10-01');
  assert.equal(firstInMonth.day, 1);

  const next = shiftMonth(2026, 12, 1);
  assert.deepEqual(next, { year: 2027, month: 1 });
  const prev = shiftMonth(2026, 1, -1);
  assert.deepEqual(prev, { year: 2025, month: 12 });
}

function testPastDateHelpers() {
  const now = new Date('2026-10-20T15:00:00.000Z');
  assert.equal(todayDateKey(now, 'America/Chicago'), '2026-10-20');
  assert.equal(isDateBeforeToday('2026-10-19', now, 'America/Chicago'), true);
  assert.equal(isDateBeforeToday('2026-10-20', now, 'America/Chicago'), false);
  assert.equal(compareDateKeys('2026-10-19', '2026-10-20'), -1);
}

function testTimezoneChangeDoesNotShiftWallClock() {
  // Saved wall time stays identical regardless of which zone is used for defaults.
  const value = '2026-10-21T08:00';
  const a = initialDraftFromValue(value, { timeZone: 'America/Chicago' });
  const b = initialDraftFromValue(value, { timeZone: 'America/New_York' });
  assert.deepEqual(a, b);
  assert.equal(buildWallDateTime(a.date, a.hour, a.minute, a.ampm), value);
}

function testDstSpringForwardWallClock() {
  // US spring forward 2026-03-08: 2:00 AM does not exist in America/Chicago,
  // but wall-clock strings remain literal — we do not rewrite them.
  const value = '2026-03-08T02:30';
  const parts = parseWallDateTime(value);
  assert.equal(buildWallDateTime(parts.date, parts.hour, parts.minute, parts.ampm), value);

  // "Tomorrow" from Mar 7 Chicago afternoon is Mar 8 at 8 AM wall clock.
  const now = new Date('2026-03-07T21:00:00.000Z'); // 3pm CST
  const draft = defaultDraftParts(now, 'America/Chicago');
  assert.equal(draft.date, '2026-03-08');
  assert.equal(draft.hour, 8);
}

function testDstFallBackWallClock() {
  // US fall back 2026-11-01: wall clock 1:30 AM is ambiguous but stored literally.
  const value = '2026-11-01T01:30';
  const parts = parseWallDateTime(value);
  assert.deepEqual(parts, { date: '2026-11-01', hour: 1, minute: 30, ampm: 'AM' });
  assert.equal(buildWallDateTime(parts.date, parts.hour, parts.minute, parts.ampm), value);

  const now = new Date('2026-10-31T18:00:00.000Z');
  assert.equal(dateKeyFromOffset(1, now, 'America/Chicago'), '2026-11-01');
}

function testAddDaysYearBoundary() {
  assert.deepEqual(addDays(2026, 12, 31, 1), { year: 2027, month: 1, day: 1 });
  assert.deepEqual(addDays(2026, 1, 1, -1), { year: 2025, month: 12, day: 31 });
  assert.equal(formatDateKey(2026, 2, 3), '2026-02-03');
}

function testGetZonedPartsInvalidZoneFallsBack() {
  const now = new Date('2026-10-20T15:00:00.000Z');
  const parts = getZonedParts(now, 'Not/A_Real_Zone');
  assert.equal(typeof parts.year, 'number');
  assert.equal(typeof parts.month, 'number');
  assert.equal(typeof parts.day, 'number');
}

const tests = [
  testParseAndBuildRoundTrip,
  testHourMinuteClamps,
  testDefaultIsTomorrowAt8Am,
  testDefaultUsesJobTimezoneAcrossDateLine,
  testExistingValueReopensExactly,
  testEmptyValueUsesDefaultNotSaved,
  testQuickSelectsAndMonthRollover,
  testNextMondayWhenTodayIsMonday,
  testMonthGridAndShift,
  testPastDateHelpers,
  testTimezoneChangeDoesNotShiftWallClock,
  testDstSpringForwardWallClock,
  testDstFallBackWallClock,
  testAddDaysYearBoundary,
  testGetZonedPartsInvalidZoneFallsBack,
];

let failed = 0;
for (const test of tests) {
  try {
    test();
    console.log(`ok - ${test.name}`);
  } catch (err) {
    failed += 1;
    console.error(`fail - ${test.name}`);
    console.error(err);
  }
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}

console.log(`\n${tests.length} tests passed`);
