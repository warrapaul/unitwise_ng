import { ApplicationConfig, provideAppInitializer, inject } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { loadingInterceptor } from './core/interceptors/loading.interceptor';
import { sessionExpiryInterceptor } from './core/interceptors/session-expiry.interceptor';
import { AuthService } from './core/auth/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
    /*
     * Order matters on the way back: the last interceptor is the closest to
     * the network, so its catchError runs first. sessionExpiry has to sit
     * after errorInterceptor or a 401 it silently recovers from would still
     * have raised a toast on the way past.
     */
    provideHttpClient(withInterceptors([
      authInterceptor,
      loadingInterceptor,
      errorInterceptor,
      sessionExpiryInterceptor
    ])),
    provideAnimations(),
    provideAppInitializer(() => {
      const authService = inject(AuthService);
      return authService.restoreSession();
    })
  ]
};
