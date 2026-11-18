import { Injectable, signal } from '@angular/core';

/** Someone to call when a page fails: a tenant's caretaker or landlord. */
export interface HelpContact {
  name: string;
  phone: string;
  whatsapp?: string | null;
  /** The signed-in user it was found for: another sign-in on this browser does not see it. */
  forUser: number | null;
}

/**
 * Who an error state offers as "Request help". Set by the tenant's tenancy store from the
 * building's contacts; with nobody set, error states point to Help & support instead.
 */
@Injectable({ providedIn: 'root' })
export class HelpContactService {
  readonly contact = signal<HelpContact | null>(null);
}
