export const CERTIFICATE_DOC_TYPES = new Set(['certificate', 'cert', 'license']);

export const LICENSE_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
]);

const LICENSE_IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|bmp)$/i;
const REJECTED_IMAGE_EXTENSIONS = /\.(heic|heif|tiff?|svg)$/i;

const PLACEHOLDER_TITLES = new Set([
  'self-reported via ghl intake',
  'ghl_self_reported',
]);

const PLACEHOLDER_NUMBERS = new Set([
  'ghl_self_reported',
]);

const UNSUPPORTED_LICENSE_IMAGE_MESSAGE =
  'This file is not a supported image type. Please upload a JPEG, PNG, WebP, GIF, or BMP.';

export const LICENSE_IMAGE_ACCEPT = 'image/*';

export function isTechnicianCertificateDocument(doc, technicianProfileId) {
  return CERTIFICATE_DOC_TYPES.has(String(doc?.doc_type || '').toLowerCase())
    && String(doc?.uploadable_type || '') === 'TechnicianProfile'
    && Number(doc?.uploadable_id) === Number(technicianProfileId);
}

export function extractDocumentsList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.documents)) return payload.documents;
  return [];
}

export function isAllowedLicenseImageFile(file) {
  if (!file) return { ok: false, message: 'Attach an image before saving.' };
  const mime = String(file.type || '').toLowerCase();
  const name = String(file.name || '').trim();
  if (REJECTED_IMAGE_EXTENSIONS.test(name) || mime === 'image/heic' || mime === 'image/heif' || mime === 'image/tiff' || mime === 'image/svg+xml') {
    if (mime === 'image/heic' || mime === 'image/heif' || /\.(heic|heif)$/i.test(name)) {
      return {
        ok: false,
        message: 'HEIC/HEIF images are not supported. Please upload a JPEG, PNG, WebP, GIF, or BMP.',
      };
    }
    if (mime === 'image/tiff' || /\.tiff?$/i.test(name)) {
      return {
        ok: false,
        message: 'TIFF images are not supported. Please upload a JPEG, PNG, WebP, GIF, or BMP.',
      };
    }
    if (mime === 'image/svg+xml' || /\.svg$/i.test(name)) {
      return { ok: false, message: 'SVG files are not allowed.' };
    }
  }
  if (LICENSE_IMAGE_MIME_TYPES.has(mime) || LICENSE_IMAGE_EXTENSIONS.test(name)) {
    return { ok: true };
  }
  if (mime.startsWith('image/')) {
    return { ok: false, message: UNSUPPORTED_LICENSE_IMAGE_MESSAGE };
  }
  return { ok: false, message: UNSUPPORTED_LICENSE_IMAGE_MESSAGE };
}

export function displayLicenseTitle(doc) {
  const raw = String(doc?.issuer || '').trim();
  if (!raw || PLACEHOLDER_TITLES.has(raw.toLowerCase())) return 'Trade license';
  return raw;
}

export function displayLicenseNumber(doc) {
  const raw = String(doc?.document_number || '').trim();
  if (!raw || PLACEHOLDER_NUMBERS.has(raw.toLowerCase())) return '';
  return raw;
}

export function licenseStatusLabel(status) {
  const key = String(status || '').toLowerCase();
  if (key === 'approved') return 'Verified';
  if (key === 'rejected') return 'Rejected';
  return 'Pending verification';
}

export function licenseStatusVariant(status) {
  const key = String(status || '').toLowerCase();
  if (key === 'approved') return 'success';
  if (key === 'rejected') return 'danger';
  return 'warning';
}

export function licenseSourceLabel(doc) {
  const source = String(doc?.metadata?.source || '').toLowerCase();
  if (source === 'ghl_intake') return 'Added during TechFlash signup';
  return '';
}

export function formatLicenseUploadedDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function presentLicenseCard(doc, resolveUrl) {
  const imageUrl = typeof resolveUrl === 'function' ? resolveUrl(doc?.file_url, doc?.updated_at) : (doc?.file_url || null);
  const hasImage = Boolean(imageUrl);
  return {
    id: doc?.id,
    title: displayLicenseTitle(doc),
    licenseNumber: displayLicenseNumber(doc),
    statusLabel: licenseStatusLabel(doc?.status),
    statusVariant: licenseStatusVariant(doc?.status),
    sourceLabel: licenseSourceLabel(doc),
    uploadedLabel: formatLicenseUploadedDate(doc?.created_at),
    imageUrl: hasImage ? imageUrl : null,
    hasImage,
    missingImageLabel: 'No image uploaded',
    status: doc?.status,
  };
}

export function licenseFormShouldBeVisible(formOpen) {
  return formOpen === true;
}

export function licenseEmptyStateVisible(licenses) {
  return !Array.isArray(licenses) || licenses.length === 0;
}

export function usesLicenseItemLabels() {
  return false;
}

export function emptyLicenseForm() {
  return { title: '', reference: '', file: null };
}
