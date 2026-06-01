import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

export const WS_URL = new InjectionToken<string>('WS_URL', {
  providedIn: 'root',
  factory: () => environment.wsUrl
});
