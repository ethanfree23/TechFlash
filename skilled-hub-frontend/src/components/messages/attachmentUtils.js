export function fileKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export function mergeUniqueFiles(existingFiles = [], incomingFiles = []) {
  const existing = Array.isArray(existingFiles) ? existingFiles : [];
  const incoming = Array.isArray(incomingFiles) ? incomingFiles : [];
  if (incoming.length === 0) return existing;

  const seen = new Set(existing.map((file) => fileKey(file)));
  const merged = [...existing];
  incoming.forEach((file) => {
    if (!file) return;
    const key = fileKey(file);
    if (seen.has(key)) return;
    merged.push(file);
    seen.add(key);
  });
  return merged;
}

export function imageFilesFromPasteEvent(event) {
  const items = Array.from(event?.clipboardData?.items || []);
  return items
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(Boolean);
}

export function humanFileSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
