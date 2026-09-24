import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { RoutePaths } from '../../../core/routes/route-paths';

/**
 * Password or phone code — two ways into the same session, so they read as
 * tabs. Each tab is still its own route: the forms differ, a deep link to
 * /phone-login keeps working, and back undoes a switch like any navigation.
 */
@Component({
  selector: 'app-login-method-tabs',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="tabs" aria-label="Sign-in method">
      <a class="tabs__tab" [routerLink]="RoutePaths.login"
         routerLinkActive="tabs__tab--active" ariaCurrentWhenActive="page">Password</a>
      <a class="tabs__tab" [routerLink]="RoutePaths.phoneLogin"
         routerLinkActive="tabs__tab--active" ariaCurrentWhenActive="page">Phone code</a>
    </nav>
  `,
  styles: [`
    .tabs__tab { flex: 1 1 0; text-align: center; text-decoration: none; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginMethodTabsComponent {
  readonly RoutePaths = RoutePaths;
}
