import assert from 'assert';
import {
  TECHNICIAN_CLASS_SLUGS,
  TECHNICIAN_CLASS_LABELS,
  isTechnicianClass,
  technicianClassLabel,
  technicianClassSlug,
} from '../src/constants/technicianClass.js';

function testCanonicalSlugs() {
  assert.deepStrictEqual(TECHNICIAN_CLASS_SLUGS, ['apprentice', 'journeyman', 'master']);
  assert.strictEqual(TECHNICIAN_CLASS_LABELS.apprentice, 'Apprentice');
  assert.strictEqual(TECHNICIAN_CLASS_LABELS.journeyman, 'Journeyman');
  assert.strictEqual(TECHNICIAN_CLASS_LABELS.master, 'Master');
}

function testSlugNormalization() {
  assert.strictEqual(technicianClassSlug('Journeyman'), 'journeyman');
  assert.strictEqual(technicianClassSlug('MASTER'), 'master');
  assert.strictEqual(technicianClassSlug('apprentice'), 'apprentice');
  assert.ok(isTechnicianClass('Journeyman'));
  assert.ok(!isTechnicianClass('HVAC'));
  assert.ok(!isTechnicianClass('Electrician'));
}

function testDisplayLabels() {
  assert.strictEqual(technicianClassLabel('journeyman'), 'Journeyman');
  assert.strictEqual(technicianClassLabel('HVAC'), 'HVAC');
}

function run() {
  testCanonicalSlugs();
  testSlugNormalization();
  testDisplayLabels();
  console.log('technicianClass tests passed');
}

run();
