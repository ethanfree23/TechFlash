import assert from 'assert';
import {
  displayLicenseNumber,
  displayLicenseTitle,
  emptyLicenseForm,
  extractDocumentsList,
  isAllowedLicenseImageFile,
  isTechnicianCertificateDocument,
  licenseEmptyStateVisible,
  licenseFormShouldBeVisible,
  licenseSourceLabel,
  licenseStatusLabel,
  presentLicenseCard,
  usesLicenseItemLabels,
} from '../src/utils/licenseCredentials.js';

function ghlDoc(overrides = {}) {
  return {
    id: 11,
    uploadable_id: 7,
    uploadable_type: 'TechnicianProfile',
    doc_type: 'certificate',
    status: 'pending_review',
    file_url: '/rails/active_storage/blobs/redirect/ghl-license.png',
    issuer: 'Texas Journeyman Electrician',
    document_number: '123456',
    metadata: { source: 'ghl_intake', has_trade_credential: true },
    created_at: '2026-09-10T12:00:00Z',
    updated_at: '2026-09-10T12:00:00Z',
    ...overrides,
  };
}

function manualDoc(overrides = {}) {
  return {
    id: 12,
    uploadable_id: 7,
    uploadable_type: 'TechnicianProfile',
    doc_type: 'certificate',
    status: 'pending_review',
    file_url: '/rails/active_storage/blobs/redirect/manual-license.png',
    issuer: 'ASE Master Technician',
    document_number: 'ASE-99',
    metadata: {},
    created_at: '2026-09-10T12:00:00Z',
    updated_at: '2026-09-10T12:00:00Z',
    ...overrides,
  };
}

function testGhlTitleAndNumberDisplay() {
  const card = presentLicenseCard(ghlDoc(), (url) => url);
  assert.strictEqual(card.title, 'Texas Journeyman Electrician');
  assert.strictEqual(card.licenseNumber, '123456');
  assert.strictEqual(card.statusLabel, 'Pending verification');
  assert.strictEqual(card.hasImage, true);
  assert.ok(card.imageUrl.includes('/rails/active_storage/'));
}

function testHidesInternalGhlPlaceholders() {
  assert.strictEqual(displayLicenseTitle({ issuer: 'Self-reported via GHL intake' }), 'Trade license');
  assert.strictEqual(displayLicenseNumber({ document_number: 'GHL_SELF_REPORTED' }), '');
  assert.strictEqual(licenseSourceLabel(ghlDoc()), 'Added during TechFlash signup');
  assert.strictEqual(licenseSourceLabel(manualDoc()), '');
}

function testMissingImageIsTasteful() {
  const card = presentLicenseCard(ghlDoc({ file_url: null }), () => null);
  assert.strictEqual(card.hasImage, false);
  assert.strictEqual(card.missingImageLabel, 'No image uploaded');
  assert.notStrictEqual(card.missingImageLabel, 'Preview unavailable');
  assert.notStrictEqual(card.missingImageLabel, 'Document unavailable');
}

function testModalViewModel() {
  const card = presentLicenseCard(ghlDoc(), (url) => `https://api.example${url}`);
  assert.strictEqual(card.title, 'Texas Journeyman Electrician');
  assert.strictEqual(card.licenseNumber, '123456');
  assert.strictEqual(card.statusLabel, 'Pending verification');
  assert.ok(card.imageUrl);
  assert.ok(card.uploadedLabel);
}

function testExistingLicensesDoNotOpenEmptyForm() {
  assert.strictEqual(licenseFormShouldBeVisible(false), false);
  assert.strictEqual(licenseEmptyStateVisible([ghlDoc()]), false);
  assert.strictEqual(usesLicenseItemLabels(), false);
  assert.deepStrictEqual(emptyLicenseForm(), { title: '', reference: '', file: null });
}

function testEmptyStateAndAddForm() {
  assert.strictEqual(licenseEmptyStateVisible([]), true);
  assert.strictEqual(licenseFormShouldBeVisible(true), true);
  assert.strictEqual(licenseFormShouldBeVisible(false), false);
}

function testGhlAndManualUseSameCardShape() {
  const resolve = (url) => url;
  const ghl = presentLicenseCard(ghlDoc(), resolve);
  const manual = presentLicenseCard(manualDoc(), resolve);
  assert.deepStrictEqual(Object.keys(ghl).sort(), Object.keys(manual).sort());
  assert.strictEqual(ghl.statusLabel, manual.statusLabel);
  assert.strictEqual(displayLicenseTitle(ghlDoc()), 'Texas Journeyman Electrician');
  assert.strictEqual(displayLicenseTitle(manualDoc()), 'ASE Master Technician');
}

function testImageTypeAllowlist() {
  assert.strictEqual(isAllowedLicenseImageFile({ type: 'image/jpeg', name: 'a.jpg' }).ok, true);
  assert.strictEqual(isAllowedLicenseImageFile({ type: 'image/png', name: 'a.png' }).ok, true);
  assert.strictEqual(isAllowedLicenseImageFile({ type: 'image/webp', name: 'a.webp' }).ok, true);
  assert.strictEqual(isAllowedLicenseImageFile({ type: 'image/gif', name: 'a.gif' }).ok, true);
  assert.strictEqual(isAllowedLicenseImageFile({ type: 'image/bmp', name: 'a.bmp' }).ok, true);
  assert.strictEqual(isAllowedLicenseImageFile({ type: 'image/heic', name: 'a.heic' }).ok, false);
  assert.match(isAllowedLicenseImageFile({ type: 'image/heic', name: 'a.heic' }).message, /HEIC\/HEIF/);
  assert.strictEqual(isAllowedLicenseImageFile({ type: 'text/plain', name: 'notes.txt' }).ok, false);
  assert.match(isAllowedLicenseImageFile({ type: 'text/plain', name: 'notes.txt' }).message, /not a supported image type/);
}

function testDocumentFiltering() {
  const docs = extractDocumentsList({
    documents: [ghlDoc(), { id: 99, doc_type: 'drivers_license', uploadable_type: 'TechnicianProfile', uploadable_id: 7 }],
  });
  const certs = docs.filter((doc) => isTechnicianCertificateDocument(doc, 7));
  assert.strictEqual(certs.length, 1);
  assert.strictEqual(certs[0].id, 11);
}

function testVerifiedStatus() {
  assert.strictEqual(licenseStatusLabel('approved'), 'Verified');
  assert.strictEqual(licenseStatusLabel('pending_review'), 'Pending verification');
}

function run() {
  testGhlTitleAndNumberDisplay();
  testHidesInternalGhlPlaceholders();
  testMissingImageIsTasteful();
  testModalViewModel();
  testExistingLicensesDoNotOpenEmptyForm();
  testEmptyStateAndAddForm();
  testGhlAndManualUseSameCardShape();
  testImageTypeAllowlist();
  testDocumentFiltering();
  testVerifiedStatus();
  console.log('licenseCredentials tests passed');
}

run();
