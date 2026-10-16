/** A device position and how far off it may be. */
export interface DevicePosition {
  latitude: number;
  longitude: number;
  /** Radius in metres within which the true position probably lies. */
  accuracy: number;
}

/** Below this a reading is good enough to stop waiting. */
const GOOD_ENOUGH_METERS = 15;
/** Above this the position is worth a warning: probably Wi-Fi or network, not GPS. */
export const ROUGH_METERS = 50;

/**
 * The most accurate position the device gives within `waitMs`.
 *
 * A single getCurrentPosition returns the first fix, which is usually the coarsest (a network or
 * Wi-Fi guess, often only four decimals). Watching for a few seconds lets GPS settle; we keep the
 * best reading and stop as soon as one is within {@link GOOD_ENOUGH_METERS}. Coordinates are kept
 * to seven decimals (about a centimetre) — the precision of the database columns.
 */
export function bestDevicePosition(waitMs = 20000): Promise<DevicePosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject({ code: 2, message: 'This device cannot report a location.' } as GeolocationPositionError);
      return;
    }
    let best: GeolocationPosition | null = null;
    let watchId: number | null = null;
    const finish = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      if (best) {
        resolve({
          latitude: round7(best.coords.latitude),
          longitude: round7(best.coords.longitude),
          accuracy: Math.round(best.coords.accuracy)
        });
      }
    };
    const timer = setTimeout(() => {
      if (best) finish();
      else {
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        reject({ code: 3, message: 'Timed out' } as GeolocationPositionError);
      }
    }, waitMs);
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!best || position.coords.accuracy < best.coords.accuracy) best = position;
        if (position.coords.accuracy <= GOOD_ENOUGH_METERS) finish();
      },
      (error) => {
        // Keep waiting for a later fix unless permission was refused or nothing ever arrived.
        if (error.code === error.PERMISSION_DENIED || !best) {
          if (watchId !== null) navigator.geolocation.clearWatch(watchId);
          clearTimeout(timer);
          if (best) finish(); else reject(error);
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: waitMs }
    );
  });
}

/** What to tell someone about a reading's accuracy. */
export function accuracyNote(accuracy: number): string {
  if (accuracy <= ROUGH_METERS) {
    return `Accurate to about ${accuracy} m.`;
  }
  const distance = accuracy >= 1000 ? `${(accuracy / 1000).toFixed(1)} km` : `${accuracy} m`;
  return `Only accurate to about ${distance} — this device has no GPS fix (common on laptops). `
    + 'Use a phone outdoors, or paste a map link for the exact spot.';
}

function round7(value: number): number {
  return Math.round(value * 1e7) / 1e7;
}
