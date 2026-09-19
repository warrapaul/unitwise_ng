import { Injectable, computed, effect, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'unitwise_theme';

/**
 * Which palette the app paints in.
 *
 * Three states, not two. "System" is the default and is a real answer, not
 * the absence of one: somebody whose phone dims at sunset expects this to
 * follow, and forcing a choice at first run means guessing for them.
 *
 * The preference is per browser, not per account — it describes the screen
 * in front of you, and the same person on a bright desktop and a dark phone
 * wants different answers. So `localStorage`, not the profile.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly stored = signal<ThemePreference>(this.restore());

  readonly preference = this.stored.asReadonly();

  /** What is actually painted right now, with "system" resolved. */
  readonly resolved = computed<'light' | 'dark'>(() => {
    const preference = this.stored();
    return preference === 'system' ? this.systemPrefersDark() : preference;
  });

  private readonly systemDark = signal(this.mediaQuery()?.matches ?? false);

  constructor() {
    // Follow the OS while the preference is "system" — a theme that only
    // updates on reload is one the person has to think about.
    this.mediaQuery()?.addEventListener('change', (event) => this.systemDark.set(event.matches));

    effect(() => {
      const theme = this.resolved();
      const root = document.documentElement;

      /*
       * An explicit choice is stamped; "system" is left unstamped so the
       * CSS media query decides. Stamping the resolved value always would
       * work, but it would also make a stale attribute outlive a change in
       * the OS setting if the listener ever failed to attach.
       */
      if (this.stored() === 'system') {
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', theme);
      }

      root.style.colorScheme = theme;
    });
  }

  set(preference: ThemePreference): void {
    this.stored.set(preference);

    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Private browsing, or storage disabled. The choice still applies for
      // this session; it just will not be remembered.
    }
  }

  private systemPrefersDark(): 'light' | 'dark' {
    return this.systemDark() ? 'dark' : 'light';
  }

  private mediaQuery(): MediaQueryList | null {
    return typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
  }

  private restore(): ThemePreference {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'light' || saved === 'dark' ? saved : 'system';
    } catch {
      return 'system';
    }
  }
}
