/**
 * Google Maps links built from a point, using the documented URL scheme
 * (https://developers.google.com/maps/documentation/urls) — no API key, and
 * they open the Maps app on a phone.
 */

/** "-1.2921000,36.8219000" → "-1.2921,36.8219": what Maps search and most apps accept. */
export function coordinatesText(lat: number | string, lng: number | string): string {
  return `${Number(lat)},${Number(lng)}`;
}

/** The point on the map, with a pin. */
export function mapsPlaceUrl(lat: number | string, lng: number | string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinatesText(lat, lng))}`;
}

/** Directions from wherever the user is to the point. */
export function mapsDirectionsUrl(lat: number | string, lng: number | string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coordinatesText(lat, lng))}`;
}

/**
 * Copies text, falling back to `execCommand` where `navigator.clipboard` is
 * unavailable (it needs a secure context, which a plain-HTTP LAN build lacks).
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** "350 m", "1.4 km". */
export function distanceLabel(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) {
    return '';
  }
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

/**
 * "-1.292066, 36.821946" as copied from a map (comma or space between them) →
 * the pair; anything else, or a value out of range, → null.
 */
export function parseLatLng(text: string | null | undefined): { lat: number; lng: number } | null {
  const match = (text ?? '').trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) {
    return null;
  }
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/** Straight-line distance in metres (haversine): enough to rank landmarks around a gate. */
export function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * rad / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lng2 - lng1) * rad / 2) ** 2;
  return Math.round(12_742_000 * Math.asin(Math.sqrt(a)));
}
