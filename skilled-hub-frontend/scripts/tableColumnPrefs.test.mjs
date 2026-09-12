import assert from 'assert';
import {
  clampTableColumnWidth,
  columnsFromSavedArray,
  minWidthForColumnKey,
  normalizeSavedColumnsJson,
  serializeTableColumns,
  TABLE_COL_MAX_WIDTH,
  TABLE_COL_MIN_WIDTH,
} from '../src/utils/tableColumnPrefs.js';

const defaults = [
  { key: 'user', label: 'User', visible: true, width: 200 },
  { key: 'status', label: 'Status', visible: true, width: 80 },
  { key: 'risk', label: 'Risk', visible: true, width: 64 },
];

function testClampRespectsMinMax() {
  assert.equal(clampTableColumnWidth('not-a-number'), null);
  assert.equal(clampTableColumnWidth(20), TABLE_COL_MIN_WIDTH);
  assert.equal(clampTableColumnWidth(900), TABLE_COL_MAX_WIDTH);
  assert.equal(clampTableColumnWidth(180), 180);
  assert.equal(minWidthForColumnKey('user'), 140);
  assert.equal(minWidthForColumnKey('status'), TABLE_COL_MIN_WIDTH);
}

function testSavedWidthsRoundTrip() {
  const saved = [
    { key: 'status', visible: false, width: 140 },
    { key: 'user', visible: true, width: 240 },
  ];
  const hydrated = columnsFromSavedArray(saved, defaults);
  assert.deepEqual(
    hydrated.map((c) => ({ key: c.key, visible: c.visible, width: c.width })),
    [
      { key: 'status', visible: false, width: 140 },
      { key: 'user', visible: true, width: 240 },
      { key: 'risk', visible: true, width: 64 },
    ]
  );

  const serialized = serializeTableColumns(hydrated);
  assert.deepEqual(serialized, [
    { key: 'status', visible: false, width: 140 },
    { key: 'user', visible: true, width: 240 },
    { key: 'risk', visible: true, width: 64 },
  ]);
}

function testLegacySavedPrefsKeepDefaultWidths() {
  const hydrated = columnsFromSavedArray(
    [{ key: 'user', visible: true }, { key: 'status', visible: false }],
    defaults
  );
  assert.equal(hydrated.find((c) => c.key === 'user').width, 200);
  assert.equal(hydrated.find((c) => c.key === 'status').visible, false);
  assert.equal(hydrated.find((c) => c.key === 'status').width, 80);
}

function testNormalizeIncludesWidthForDirtyCheck() {
  const withWidth = [{ key: 'user', visible: true, width: 200 }];
  const withoutWidth = [{ key: 'user', visible: true }];
  assert.notEqual(normalizeSavedColumnsJson(withWidth), normalizeSavedColumnsJson(withoutWidth));
  assert.equal(
    normalizeSavedColumnsJson(withWidth),
    JSON.stringify([{ key: 'user', visible: true, width: 200 }])
  );
}

function testLegacyLocationAndSubscriptionColumnsMigrate() {
  const defaults = [
    { key: 'user', label: 'User', visible: true, width: 200 },
    { key: 'city', label: 'City', visible: true, width: 104 },
    { key: 'state', label: 'State', visible: true, width: 56 },
    { key: 'zip', label: 'ZIP', visible: false, width: 72 },
    { key: 'membership_tier', label: 'Tier', visible: true, width: 80 },
  ];
  const hydrated = columnsFromSavedArray(
    [
      { key: 'user', visible: true, width: 200 },
      { key: 'location', visible: true, width: 120 },
      { key: 'subscription', visible: true, width: 100 },
    ],
    defaults
  );
  assert.deepEqual(
    hydrated.map((c) => c.key),
    ['user', 'city', 'state', 'zip', 'membership_tier']
  );
  assert.ok(!hydrated.some((c) => c.key === 'subscription'));
  assert.ok(!hydrated.some((c) => c.key === 'location'));
}

function testMissingZipColumnInsertsAfterState() {
  const defaults = [
    { key: 'user', label: 'User', visible: true, width: 200 },
    { key: 'city', label: 'City', visible: true, width: 104 },
    { key: 'state', label: 'State', visible: true, width: 56 },
    { key: 'zip', label: 'ZIP', visible: false, width: 72 },
    { key: 'activity', label: 'Activity', visible: true, width: 120 },
  ];
  const hydrated = columnsFromSavedArray(
    [
      { key: 'user', visible: true, width: 200 },
      { key: 'city', visible: true, width: 104 },
      { key: 'state', visible: true, width: 56 },
      { key: 'activity', visible: true, width: 120 },
    ],
    defaults
  );
  assert.deepEqual(
    hydrated.map((c) => ({ key: c.key, visible: c.visible })),
    [
      { key: 'user', visible: true },
      { key: 'city', visible: true },
      { key: 'state', visible: true },
      { key: 'zip', visible: false },
      { key: 'activity', visible: true },
    ]
  );
}

testClampRespectsMinMax();
testSavedWidthsRoundTrip();
testLegacySavedPrefsKeepDefaultWidths();
testNormalizeIncludesWidthForDirtyCheck();
testLegacyLocationAndSubscriptionColumnsMigrate();
testMissingZipColumnInsertsAfterState();
console.log('tableColumnPrefs tests passed');
