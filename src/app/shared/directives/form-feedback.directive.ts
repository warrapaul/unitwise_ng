import { AfterViewInit, DestroyRef, Directive, ElementRef, HostListener, inject } from '@angular/core';
import { FormGroupDirective, Validators } from '@angular/forms';

/**
 * Two things every form needs and none of them had.
 *
 * **Marks required fields.** Adds `field--required` to the label wrapping any
 * control carrying `Validators.required`, which the global stylesheet renders as
 * a red asterisk. Read from the validators themselves, so a field cannot be
 * required in TypeScript and unmarked in the template.
 *
 * **Takes the operator to the first error.** A long form submitted from the
 * bottom used to reject silently — the message was three screens up, out of
 * sight, and the button simply looked dead. On an invalid submit the first
 * invalid control is scrolled into view and focused.
 *
 *     <form [formGroup]="form" (ngSubmit)="submit()" appFormFeedback>
 */
@Directive({
  selector: 'form[appFormFeedback]',
  standalone: true
})
export class FormFeedbackDirective implements AfterViewInit {
  private readonly host = inject<ElementRef<HTMLFormElement>>(ElementRef);
  private readonly formDirective = inject(FormGroupDirective, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  ngAfterViewInit(): void {
    this.markRequired();

    // Fields appear and disappear with @if, so re-mark when the DOM changes.
    const observer = new MutationObserver(() => this.markRequired());
    observer.observe(this.host.nativeElement, { childList: true, subtree: true });
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  /**
   * Runs on the native submit, which fires before Angular's `ngSubmit` handler
   * decides to bail — so the scroll happens even when the component returns
   * early on `form.invalid`.
   */
  @HostListener('submit')
  onSubmit(): void {
    const form = this.formDirective?.form;
    if (!form || form.valid) {
      return;
    }

    // Wait for the invalid classes and error messages to render.
    requestAnimationFrame(() => this.focusFirstInvalid());
  }

  private markRequired(): void {
    const form = this.formDirective?.form;
    if (!form) {
      return;
    }

    const controls = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[formControlName]'));
    for (const element of controls) {
      const name = element.getAttribute('formControlName');
      const control = name ? form.get(name) : null;
      const label = element.closest('label.field');
      if (!control || !label) {
        continue;
      }

      label.classList.toggle('field--required', control.hasValidator(Validators.required));
    }
  }

  private focusFirstInvalid(): void {
    const invalid = this.host.nativeElement.querySelector<HTMLElement>(
      '[formControlName].ng-invalid, [formcontrolname].ng-invalid'
    );

    if (!invalid) {
      return;
    }

    (invalid.closest('label.field') ?? invalid).scrollIntoView({ behavior: 'smooth', block: 'center' });

    // A custom control renders a button or an input inside itself; focus what
    // the operator can actually type into.
    const focusable = invalid.matches('input, select, textarea, button')
      ? invalid
      : invalid.querySelector<HTMLElement>('input, select, textarea, button');
    focusable?.focus({ preventScroll: true });
  }
}
