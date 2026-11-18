import { DOCUMENT } from '@angular/common';
import { Directive, ElementRef, Input, OnChanges, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * Scroll motion for the landing page, kept small on purpose: one shared IntersectionObserver,
 * each element animates once, and only opacity and transform change.
 *
 * Content is visible by default. The hidden starting state is a class this file adds, so without
 * script, without IntersectionObserver or with reduced motion asked for, nothing is ever hidden.
 */
function motionAllowed(doc: Document): boolean {
  const win = doc.defaultView;
  return !!win && 'IntersectionObserver' in win && !win.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const callbacks = new WeakMap<Element, () => void>();
let observer: IntersectionObserver | null = null;

function watch(el: Element, onEnter: () => void): void {
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer?.unobserve(entry.target);
      callbacks.get(entry.target)?.();
      callbacks.delete(entry.target);
    }
  }, { rootMargin: '0px 0px -12% 0px' });
  callbacks.set(el, onEnter);
  observer.observe(el);
}

function unwatch(el: Element): void {
  callbacks.delete(el);
  observer?.unobserve(el);
}

/** Adds `rv` now and `in` the first time the element scrolls into view; the page's CSS does the rest. */
@Directive({ selector: '[appReveal]', standalone: true })
export class RevealDirective implements OnInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly doc = inject(DOCUMENT);

  ngOnInit(): void {
    if (!motionAllowed(this.doc)) return;
    this.el.classList.add('rv');
    watch(this.el, () => this.el.classList.add('in'));
  }

  ngOnDestroy(): void {
    unwatch(this.el);
  }
}

/** Shows a number formatted, and counts up to it once when it first comes into view. */
@Directive({ selector: '[appCountUp]', standalone: true })
export class CountUpDirective implements OnChanges, OnDestroy {
  @Input({ required: true }) appCountUp = 0;
  @Input() countFormat: (value: number) => string = (value) => String(value);

  private readonly el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly doc = inject(DOCUMENT);
  private frame = 0;
  private watching = false;

  ngOnChanges(): void {
    const target = Number(this.appCountUp) || 0;
    this.el.textContent = this.countFormat(target);
    if (this.watching || target <= 0 || !motionAllowed(this.doc)) return;
    this.watching = true;
    watch(this.el, () => this.run(target));
  }

  private run(target: number): void {
    const win = this.doc.defaultView!;
    const start = win.performance.now();
    const duration = 900;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.el.textContent = this.countFormat(t < 1 ? Math.round(target * eased) : target);
      if (t < 1) this.frame = win.requestAnimationFrame(step);
    };
    this.frame = win.requestAnimationFrame(step);
  }

  ngOnDestroy(): void {
    unwatch(this.el);
    if (this.frame) this.doc.defaultView?.cancelAnimationFrame(this.frame);
  }
}
