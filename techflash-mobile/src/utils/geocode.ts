const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const cache = new Map<string, GeocodeResult | null>();
const inflight = new Map<string, Promise<GeocodeResult | null>>();

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  formatted_address?: string;
};

/** Google Geocoding REST — requires EXPO_PUBLIC_GOOGLE_MAPS_API_KEY */
export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const q = query.trim();
  if (!q || !KEY) return null;
  if (cache.has(q)) return cache.get(q) || null;
  if (inflight.has(q)) return inflight.get(q) || null;
  const components = encodeURIComponent('country:US');
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&components=${components}&key=${encodeURIComponent(KEY)}`;
  const task = fetch(url)
    .then((res) =>
      res.json() as Promise<{
        status?: string;
        results?: { geometry?: { location?: { lat: number; lng: number } }; formatted_address?: string }[];
      }>
    )
    .then((data) => {
      if (data.status !== 'OK' || !data.results?.[0]?.geometry?.location) {
        cache.set(q, null);
        return null;
      }
      const loc = data.results[0].geometry.location;
      const result = {
        latitude: loc.lat,
        longitude: loc.lng,
        formatted_address: data.results[0].formatted_address,
      };
      cache.set(q, result);
      return result;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(q);
    });
  inflight.set(q, task);
  return task;
}
