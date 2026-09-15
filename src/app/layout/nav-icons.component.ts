import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * One hidden SVG sprite, referenced by `<use href="#nav-...">`. Keeps the icons
 * out of the markup without pulling in an icon library or routing anything
 * through `innerHTML`.
 *
 * Rendered once by the shell, so the `#act-...` action symbols below are
 * reachable from any routed page — a row action does not carry its own SVG.
 */
@Component({
  selector: 'app-nav-icons',
  standalone: true,
  template: `
    <svg aria-hidden="true" focusable="false" width="0" height="0" style="position:absolute">
      <defs>
        <g id="nav-grid"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></g>
        <g id="nav-bag"><path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></g>
        <g id="nav-user"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></g>
        <g id="nav-key"><circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H20m-3 0v3m3-3v2"/></g>
        <g id="nav-chat"><path d="M20 12a7 7 0 0 1-7 7H8l-4 3v-4.5A7 7 0 0 1 11 5h2a7 7 0 0 1 7 7Z"/></g>
        <g id="nav-bell"><path d="M18 15V10a6 6 0 1 0-12 0v5l-2 3h16l-2-3Z"/><path d="M10 21h4"/></g>
        <g id="nav-users"><circle cx="9" cy="8" r="3.2"/><path d="M3 19a6 6 0 0 1 12 0"/><path d="M16 6.5a3 3 0 0 1 0 5.8M17 19a6 6 0 0 0-1.5-4"/></g>
        <g id="nav-pin"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></g>
        <g id="nav-store"><path d="M4 9h16v11H4V9Z"/><path d="M3 9l1.5-5h15L21 9"/><path d="M9 20v-6h6v6"/></g>
        <g id="nav-building"><path d="M4 21V6l8-3 8 3v15"/><path d="M9 21v-5h6v5"/><path d="M8 9h.01M12 9h.01M16 9h.01M8 13h.01M16 13h.01"/></g>
        <g id="nav-tenants"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.5 17a4 4 0 0 1 7 0M15 10h4M15 14h3"/></g>
        <g id="nav-cash"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/></g>
        <g id="nav-shield"><path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3Z"/></g>
        <g id="nav-globe"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c4 4.5 4 12.5 0 17-4-4.5-4-12.5 0-17Z"/></g>
        <g id="nav-settings"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"/></g>
        <g id="nav-send"><path d="M21 3L10.5 13.5"/><path d="M21 3l-6.5 18-4-8-8-4L21 3Z"/></g>
        <g id="nav-dot"><circle cx="12" cy="12" r="2.6"/></g>

        <!-- Row actions. Always paired with an aria-label; see §20.3. -->
        <g id="act-edit"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M14.5 6.5l3 3"/></g>
        <g id="act-trash"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></g>
        <g id="act-view"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></g>
        <g id="act-filter"><path d="M3 5h18l-7 8v6l-4 2v-8Z"/></g>
        <g id="act-external"><path d="M14 4h6v6"/><path d="M20 4l-8.5 8.5"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></g>
      </defs>
    </svg>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavIconsComponent {}
