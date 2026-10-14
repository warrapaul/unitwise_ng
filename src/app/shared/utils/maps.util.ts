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
