import { publicApiRequest } from '../api/api.js';
import { usZip5 } from './usAddress.js';

const cache = new Map();

export async function lookupUsZip(zip) {
  const zip5 = usZip5(zip);
  if (zip5.length !== 5) return null;
  if (cache.has(zip5)) return cache.get(zip5);

  try {
    const res = await publicApiRequest(`/zip_lookup?zip=${encodeURIComponent(zip5)}`);
    const city = String(res?.city || '').trim();
    const state = String(res?.state || '').trim();
    const stateName = String(res?.state_name || '').trim();
    const latitude = Number(res?.latitude);
    const longitude = Number(res?.longitude);
    const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);
    const place = city || state || hasCoords
      ? {
          city,
          state,
          stateName,
          latitude: hasCoords ? latitude : null,
          longitude: hasCoords ? longitude : null,
        }
      : null;
    if (place) cache.set(zip5, place);
    return place;
  } catch {
    return null;
  }
}
