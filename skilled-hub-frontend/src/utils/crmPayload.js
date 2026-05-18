/** Send explicit null so Rails clears nullable string columns on PATCH. */
export function clearableString(value) {
  const t = String(value ?? '').trim();
  return t === '' ? null : t;
}

export function clearablePhone(value, formatPhone) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  return formatPhone ? formatPhone(raw) : raw;
}
