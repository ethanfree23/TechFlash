import assert from 'assert';
import {
  makeTradeLine,
  payloadFromTradeLines,
  tradeLineValidationMessage,
  tradeLinesFromProfile,
  unusedTradeOptions,
} from '../src/utils/tradeQualifications.js';

function testPayloadDerivesPrimaryAndSpecialties() {
  const payload = payloadFromTradeLines([
    makeTradeLine({ trade_type: 'Electrician', skill_class: 'apprentice', experience_years: '1' }),
    makeTradeLine({ trade_type: 'HVAC Technician', skill_class: 'journeyman', experience_years: '5' }),
    makeTradeLine({ trade_type: '', skill_class: '', experience_years: '' }),
  ]);
  assert.strictEqual(payload.trade_type, 'Electrician');
  assert.strictEqual(payload.skill_class, 'apprentice');
  assert.strictEqual(payload.experience_years, 1);
  assert.deepStrictEqual(payload.specialties, ['Electrician', 'HVAC Technician']);
  assert.strictEqual(payload.trade_qualifications.length, 2);
  assert.strictEqual(payload.trade_qualifications[1].skill_class, 'journeyman');
  assert.strictEqual(payload.trade_qualifications[1].experience_years, 5);
}

function testLinesFromStoredQualifications() {
  const lines = tradeLinesFromProfile({
    trade_type: 'Electrician',
    skill_class: 'apprentice',
    experience_years: 1,
    specialties: ['Electrician'],
    trade_qualifications: [
      { trade_type: 'Electrician', skill_class: 'apprentice', experience_years: 1 },
      { trade_type: 'Plumber', skill_class: 'master', experience_years: 8 },
    ],
  });
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(lines[1].trade_type, 'Plumber');
  assert.strictEqual(lines[1].skill_class, 'master');
  assert.strictEqual(lines[1].experience_years, 8);
}

function testLinesFromLegacySpecialties() {
  const lines = tradeLinesFromProfile({
    trade_type: 'Electrician',
    skill_class: 'Journeyman',
    experience_years: 4,
    specialties: ['HVAC Technician', 'Electrician'],
  });
  assert.strictEqual(lines[0].trade_type, 'Electrician');
  assert.strictEqual(lines[0].skill_class, 'journeyman');
  assert.strictEqual(lines[1].trade_type, 'HVAC Technician');
}

function testValidation() {
  assert.ok(tradeLineValidationMessage([makeTradeLine()]));
  assert.ok(
    tradeLineValidationMessage([makeTradeLine({ trade_type: 'Electrician', skill_class: '', experience_years: '2' })])
  );
  assert.strictEqual(
    tradeLineValidationMessage([
      makeTradeLine({ trade_type: 'Electrician', skill_class: 'apprentice', experience_years: '1' }),
    ]),
    null
  );
}

function testUnusedTradesExcludeOtherRows() {
  const lines = [
    makeTradeLine({ trade_type: 'Electrician' }),
    makeTradeLine({ trade_type: 'Plumber' }),
  ];
  const options = unusedTradeOptions(lines, 'Plumber');
  assert.ok(!options.includes('Electrician'));
  assert.ok(options.includes('Plumber'));
}

function run() {
  testPayloadDerivesPrimaryAndSpecialties();
  testLinesFromStoredQualifications();
  testLinesFromLegacySpecialties();
  testValidation();
  testUnusedTradesExcludeOtherRows();
  console.log('tradeQualifications tests passed');
}

run();
