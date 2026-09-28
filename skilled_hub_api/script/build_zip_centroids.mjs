import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const zipPath = process.argv[2];
const outGz = process.argv[3];
const tmp = path.join(process.env.TEMP || '/tmp', 'zcta_gaz_build');
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
execSync(`tar -xf "${zipPath}" -C "${tmp}"`);
const txtName = fs.readdirSync(tmp).find((name) => name.endsWith('.txt'));
const lines = fs.readFileSync(path.join(tmp, txtName), 'utf8').split(/\r?\n/).filter(Boolean);
const header = lines[0].split('\t').map((cell) => cell.trim());
const geoIdx = header.indexOf('GEOID');
const latIdx = header.indexOf('INTPTLAT');
const lngIdx = header.indexOf('INTPTLONG');
if (geoIdx < 0 || latIdx < 0 || lngIdx < 0) {
  throw new Error(`Unexpected gazetteer header: ${header.join('|')}`);
}

const centroids = {};
for (const line of lines.slice(1)) {
  const cells = line.split('\t');
  const zip = String(cells[geoIdx] || '').trim();
  const lat = Number(cells[latIdx]);
  const lng = Number(cells[lngIdx]);
  if (!/^\d{5}$/.test(zip) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  centroids[zip] = [Math.round(lat * 10000) / 10000, Math.round(lng * 10000) / 10000];
}

const existing = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.resolve('db/data/us_zips.json.gz'))));
const known = Object.keys(existing);
const missing = known.filter((zip) => !centroids[zip]);
const payload = JSON.stringify(centroids);
fs.writeFileSync(outGz, zlib.gzipSync(payload));
console.log(JSON.stringify({
  centroids: Object.keys(centroids).length,
  knownZips: known.length,
  knownMissingCentroid: missing.length,
  sampleMissing: missing.slice(0, 12),
  elPaso: centroids['79901'],
  houston: centroids['77002'],
  bytes: fs.statSync(outGz).size,
}));
