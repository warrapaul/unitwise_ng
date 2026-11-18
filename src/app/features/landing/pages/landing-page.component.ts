import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { DomSanitizer, Meta, SafeResourceUrl, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { firstValueFrom, map } from 'rxjs';
import { ApiUrls } from '../../../core/constants/api-urls';
import { ApiResponse } from '../../../core/models/api-response.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { API_URL } from '../../../core/tokens/api-url.token';
import { AppManagementService } from '../../app-management/app-management.service';
import { AppInfo, PlatformStats } from '../../app-management/models/app-management.models';
import { BillingPlan, featureLabel, kes } from '../../billing/billing.models';
import { CountUpDirective, RevealDirective } from '../landing-motion';

interface PublicPricing { plans: BillingPlan[]; trial: BillingPlan | null; vatRate?: number | string | null; }

/** How the demo plays: embedded on the page (YouTube, Vimeo, a video file), or a plain link as a last resort. */
type DemoVideo = { kind: 'embed'; src: SafeResourceUrl } | { kind: 'file'; src: string } | { kind: 'link'; src: string };

/** One line-icon set for the whole page: 24×24, stroked, drawn with currentColor. */
const ICONS: Record<string, string> = {
  bill: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3Z M9 8h6 M9 12h6 M9 16h3',
  cash: 'M3 6h18v12H3z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6 M6 12h.01 M18 12h.01',
  message: 'M4 5h16v11H9l-5 4V5Z M8 9h8 M8 12h5',
  call: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-2.4 2.6-2.6Z',
  lock: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4',
  mobile: 'M7 2h10v20H7z M11 18h2',
  globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M3 12h18 M12 3c3.5 3.5 3.5 14.5 0 18 M12 3c-3.5 3.5-3.5 14.5 0 18',
  list: 'M9 6h12 M9 12h12 M9 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  doc: 'M6 2h9l5 5v15H6z M14 2v6h6 M9 13h6 M9 17h6',
  building: 'M4 21V6l8-3 8 3v15 M9 21v-5h6v5 M8 9h.01 M12 9h.01 M16 9h.01 M8 13h.01 M16 13h.01',
  users: 'M9 11a3 3 0 1 0 0-6a3 3 0 1 0 0 6 M3 19a6 6 0 0 1 12 0 M16 6.5a3 3 0 0 1 0 5.8 M17 19a6 6 0 0 0-1.5-4',
  home: 'M3 11 12 4l9 7 M5 10v10h14V10 M10 20v-6h4v6',
  key: 'M8 14a4 4 0 1 0 0-8a4 4 0 1 0 0 8 M11 10h10 M17 10v3 M20 10v2',
  chart: 'M4 20V11 M10 20V5 M16 20v-7 M3 20h18',
  user: 'M12 11a4 4 0 1 0 0-8a4 4 0 1 0 0 8 M4 21a8 8 0 0 1 16 0',
  check: 'M5 12l4 4 10-10',
  cross: 'M6 6l12 12 M18 6 6 18',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 7v5l3 2',
  chevron: 'M9 6l6 6-6 6',
  play: 'M8 5.5v13l11-6.5-11-6.5Z'
};

/**
 * The public face of the product.
 *
 * Deliberately outside the app shell: no sidebar, no context switcher, no role. Someone arriving
 * from a link is deciding whether this is for them.
 *
 * Nothing here is invented. Prices, limits, VAT and the trial come from the live plans; contacts,
 * company details, testimonials and platform numbers come from App management, and each block is
 * left out until it is filled in there. The product pictures are the app's own screens drawn in
 * HTML with sample figures, marked as such — no stock photography, so the page stays light.
 */
@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [RouterLink, RevealDirective, CountUpDirective],
  template: `
    <a class="skip" href="#main" (click)="$event.preventDefault(); scrollTo('main')">Skip to content</a>
    <div class="landing">
      <header class="bar">
        <a class="brand" [routerLink]="RoutePaths.splash" aria-label="Unitwise home">
          <span class="brand__mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icon('home')"/></svg></span>
          <span class="brand__name">Unitwise</span>
        </a>
        <nav class="bar__links" aria-label="On this page">
          @for (link of anchors(); track link.id) {
            <button type="button" class="bar__link" (click)="scrollTo(link.id)">{{ link.label }}</button>
          }
        </nav>
        <div class="bar__actions">
          @if (whatsappLink(); as wa) {
            <a class="bar__wa" [href]="wa" target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z"/><path d="M8.5 8.5c.3 2.6 2.4 5 5 5.6l1.2-1.2 2 1-.4 1.6c-3.6.4-8-3.9-7.6-7.6l1.6-.4 1 2Z"/></svg>
            </a>
          }
          @if (session.isAuthenticated()) {
            <a class="btn btn-primary bar__cta" [routerLink]="RoutePaths.home">Open dashboard</a>
          } @else {
            <a class="bar__signin" [routerLink]="RoutePaths.login">Sign in</a>
            @if (video()) {
              <button type="button" class="btn btn-primary bar__cta" (click)="openVideo()" aria-label="Watch the demo">
                <svg class="i i--fill" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon('play')"/></svg><span class="bar__long">Watch the demo</span><span class="bar__short">Demo</span></button>
            } @else {
              <a class="btn btn-primary bar__cta" [routerLink]="RoutePaths.signup" aria-label="Start free trial"><span class="bar__long">Start free trial</span><span class="bar__short">Free trial</span></a>
            }
          }
        </div>
      </header>

      <main id="main" tabindex="-1">
        <!-- HERO -->
        <section class="hero">
          <div class="hero__copy">
            <p class="eyebrow-pill">For landlords and letting agents in Kenya</p>
            <h1>Every tenant, every payment, on record.</h1>
            <p class="lede">Rooms, tenants, leases, bills and payments in one place instead of a notebook. Rent paid by M-Pesa into your own PayBill lands on the right tenant by itself, so you always know who has paid and who still owes.</p>
            <!-- Setup takes an afternoon, so seeing it comes first; the trial is for people already sure. -->
            <div class="hero__actions">
              @if (video()) {
                <button type="button" class="btn btn-primary btn-xl" (click)="openVideo()">
                  <svg class="i i--fill" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon('play')"/></svg>Watch the demo</button>
              } @else {
                <a class="btn btn-primary btn-xl" [routerLink]="RoutePaths.signup">Start free trial</a>
              }
              @if (demoLink(); as demo) {
                <a class="btn btn-secondary btn-xl" [href]="demo" target="_blank" rel="noopener">Book a demo</a>
              }
            </div>
            @if (video()) {
              <p class="terms">Ready to set up your own? <a class="text-link" [routerLink]="RoutePaths.signup">Start a free trial</a> — {{ trialLead() }}</p>
            } @else {
              <p class="terms">{{ trialTerms() }}</p>
            }
            <div class="hero__links">
              <button type="button" class="text-cta" (click)="scrollTo('how-it-works')">See how a month runs ↓</button>
            </div>
            <ul class="ticks">
              <li><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon('lock')"/></svg>Rent never passes through us</li>
              <li><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon('mobile')"/></svg>Tenants pay from an M-Pesa prompt</li>
              <li><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon('globe')"/></svg>Opens in any phone's browser</li>
            </ul>
          </div>

          <!-- The app's own screens, drawn. Sample figures, labelled. -->
          <figure class="hero__art" [attr.role]="video() ? null : 'img'" [attr.aria-label]="video() ? null : heroArtLabel">
            <div class="laptop" aria-hidden="true">
              <div class="laptop__screen">
                <img class="shot" src="assets/landing/hero-desktop.png" width="1440" height="900" alt="" fetchpriority="high">
              </div>
              <div class="laptop__base"></div>
            </div>
            <div class="phone phone--hero" aria-hidden="true">
              <img class="shot shot--phone" src="assets/landing/hero-phone.png" width="390" height="844" alt="">
            </div>
            @if (video()) {
              <button type="button" class="play" (click)="openVideo()" aria-label="Watch the demo video">
                <span class="play__disc" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icon('play')"/></svg></span>
                <span class="play__label" aria-hidden="true">Watch the demo</span>
              </button>
            }
            <figcaption class="sample">The landlord's rent screen, and a tenant's bill.</figcaption>
          </figure>
        </section>

        <!-- PROOF: live numbers and real words when published; outcomes until then. -->
        @if (stats(); as s) {
          <section class="facts" aria-label="Unitwise in numbers">
            <div class="fact"><span class="fact__icon"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon('users')"/></svg></span><strong [appCountUp]="s.agencies" [countFormat]="countFn"></strong><span>landlords and agencies</span></div>
            <div class="fact"><span class="fact__icon"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon('building')"/></svg></span><strong [appCountUp]="s.rooms" [countFormat]="countFn"></strong><span>rooms managed</span></div>
            <div class="fact"><span class="fact__icon"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon('cash')"/></svg></span><strong [appCountUp]="+s.rentRecorded" [countFormat]="moneyFn"></strong><span>rent recorded</span></div>
          </section>
        } @else {
          <section class="facts" aria-label="What changes">
            @for (fact of facts; track fact.title) {
              <div class="fact">
                <span class="fact__icon"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon(fact.icon)"/></svg></span>
                <strong>{{ fact.title }}</strong><span>{{ fact.body }}</span>
              </div>
            }
          </section>
        }
        @if ((info()?.testimonials ?? []).length > 0) {
          <section class="section" aria-labelledby="said">
            <header class="section__head"><p class="eyebrow">From landlords using it</p><h2 id="said">In their words</h2></header>
            <div class="quotes">
              @for (t of info()!.testimonials!; track $index) {
                <figure class="quote"><blockquote>“{{ t.quote }}”</blockquote><figcaption><strong>{{ t.name }}</strong>@if (t.role) { · {{ t.role }} }</figcaption></figure>
              }
            </div>
          </section>
        }

        <!-- BEFORE / AFTER -->
        <section class="section" aria-labelledby="before-after">
          <header class="section__head">
            <p class="eyebrow">Why landlords switch</p>
            <h2 id="before-after">Rent day, before and after</h2>
          </header>
          <!-- On a phone each topic shows both sides, labelled, one under the other: nothing hides behind a toggle. -->
          <div class="compare">
            <div class="compare__grid compare__head" aria-hidden="true"><span></span><span>Today</span><span class="yes">With Unitwise</span></div>
            @for (row of compare; track row.topic) {
              <article class="compare__grid compare__row" appReveal>
                <h3><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon(row.icon)"/></svg>{{ row.topic }}</h3>
                <p class="compare__before"><span class="mark mark--no" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icon('cross')"/></svg></span><span class="compare__text"><span class="compare__tag">Today</span>{{ row.before }}</span></p>
                <p class="compare__after"><span class="mark mark--yes" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icon('check')"/></svg></span><span class="compare__text"><span class="compare__tag">With Unitwise</span>{{ row.after }}</span></p>
              </article>
            }
          </div>
        </section>

        <!-- HOW A MONTH RUNS -->
        <section class="section" id="how-it-works" aria-labelledby="how">
          <header class="section__head">
            <p class="eyebrow">How a month runs</p>
            <h2 id="how">From bills out to money in, in four steps</h2>
            <p class="section__lede">The same four steps every month, in the order they happen.</p>
          </header>
          <ol class="flow" appReveal (scroll)="onFlowScroll($event)">
            @for (step of flow; track step.title) {
              <li class="flow__step" [style.--i]="$index">
                <span class="flow__n">Step {{ $index + 1 }}</span>
                <img class="mini" [src]="'assets/landing/' + step.image" width="400" height="300" loading="lazy"
                     [alt]="step.screen.label + ': ' + step.screen.big + ', ' + step.screen.note">
                <h3>{{ step.title }}</h3>
                <p>{{ step.body }}</p>
              </li>
            }
          </ol>
          <div class="dots" aria-hidden="true">
            @for (step of flow; track step.title) { <span [class.on]="flowIndex() === $index"></span> }
            <span class="dots__hint">Swipe →</span>
          </div>
        </section>

        <!-- TENANTS: the phone first on a small screen. -->
        <section class="section section--tint" aria-labelledby="tenants">
          <div class="tenant">
            <figure class="tenant__phone">
              <div class="phone phone--large">
                <img class="shot shot--phone" src="assets/landing/tenant-phone.png" width="390" height="844" loading="lazy"
                     alt="A tenant's rent screen: the amount due, what it is made of, and Pay with M-Pesa">
              </div>
              <figcaption class="sample-note">What a tenant sees on their phone.</figcaption>
            </figure>
            <div class="tenant__copy">
              <header class="section__head">
                <p class="eyebrow">What your tenants get</p>
                <h2 id="tenants">Tenants who can see their balance stop asking you for it</h2>
                <p class="section__lede">Every tenant gets their own sign-in, in their phone's browser. “How much do I owe?” is answered on their own screen.</p>
              </header>
              <div class="groups">
                @for (group of tenantGroups; track group.title) {
                  <div class="group">
                    <h3><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon(group.icon)"/></svg>{{ group.title }}</h3>
                    <ul>@for (item of group.items; track item) { <li>{{ item }}</li> }</ul>
                  </div>
                }
              </div>
            </div>
          </div>
        </section>

        <!-- FEATURES: cards on a wide screen, accordions on a phone. -->
        <section class="section" id="features" aria-labelledby="everything">
          <header class="section__head">
            <p class="eyebrow">Everything in the box</p>
            <h2 id="everything">One system instead of a notebook, three spreadsheets and a WhatsApp group</h2>
            <p class="section__lede">Every item is a working screen in the product today.</p>
          </header>
          <div class="caps">
            @for (group of capabilities; track group.title; let i = $index) {
              <details class="cap" [open]="!narrow()">
                <summary>
                  <span class="cap__icon"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon(group.icon)"/></svg></span>
                  <h3>{{ group.title }}</h3>
                  <svg class="cap__chevron" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon('chevron')"/></svg>
                </summary>
                <ul class="cap__list">
                  @for (item of shownItems(group, i); track item) { <li>{{ item }}</li> }
                </ul>
                @if (group.items.length > 3) {
                  <button type="button" class="more" [attr.aria-expanded]="expanded().has(i)" (click)="toggleMore(i)">
                    {{ expanded().has(i) ? 'Show less' : 'Show ' + (group.items.length - 3) + ' more' }}
                    <svg class="more__chev" [class.up]="expanded().has(i)" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon('chevron')"/></svg>
                  </button>
                }
              </details>
            }
          </div>
        </section>

        <!-- ROLES -->
        <section class="section section--tint" aria-labelledby="roles">
          <header class="section__head">
            <p class="eyebrow">Your whole team, one system</p>
            <h2 id="roles">Everyone sees their part — and nothing else</h2>
            <p class="section__lede">Give access to the whole agency or to chosen buildings. A caretaker given one building sees that building and nothing more.
              <button type="button" class="text-cta inline" (click)="scrollTo('faq-access')">How access works</button></p>
          </header>
          <div class="roles">
            @for (role of roles; track role.title) {
              <article class="role">
                <span class="role__icon"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon(role.icon)"/></svg></span>
                <h3>{{ role.title }}</h3>
                <p class="role__line"><span class="mark mark--yes" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icon('check')"/></svg></span><span><strong>Sees</strong> {{ role.sees }}</span></p>
                <p class="role__line"><span class="mark mark--no" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icon('cross')"/></svg></span><span><strong>Doesn't see</strong> {{ role.not }}</span></p>
              </article>
            }
          </div>
        </section>

        <!-- PRICING: the live plans, one structure for all, worked out at the rooms you say. -->
        <section class="section" id="pricing" aria-labelledby="prices">
          <header class="section__head">
            <p class="eyebrow">Pricing</p>
            <h2 id="prices">Priced by the rooms you manage</h2>
            <p class="section__lede">Monthly prices in KES, {{ vatText() }}. You are invoiced after each month ends and can change plan any time.</p>
          </header>

          @if ((pricing()?.plans ?? []).length > 0) {
            <div class="calc">
              <label for="rooms" class="calc__label">I manage <strong>{{ rooms() }}</strong> room{{ rooms() === 1 ? '' : 's' }}</label>
              <input id="rooms" type="range" min="1" [max]="sliderMax()" [value]="rooms()" (input)="rooms.set(+$any($event.target).value)"
                     [attr.aria-valuetext]="rooms() + ' rooms'">
              <p class="calc__result" aria-live="polite">
                @if (best(); as b) {
                  <strong>{{ b.name }}</strong> fits, at <strong>{{ money(at(b, rooms())) }}</strong> a month.
                } @else {
                  That is more rooms than our plans cover. {{ contactPhrase() }}
                }
              </p>
            </div>
          }

          <div class="plans">
            @for (plan of pricing()?.plans ?? []; track plan.id) {
              <article class="plan" [class.plan--best]="best()?.id === plan.id">
                <div class="plan__head">
                  <h3>{{ plan.name }}</h3>
                  @if (best()?.id === plan.id) { <span class="badge">Best for {{ rooms() }} rooms</span> }
                </div>
                <p class="plan__price">{{ headline(plan) }} <span>a month</span></p>
                <p class="plan__how">{{ how(plan) }}</p>
                <p class="plan__at">
                  @if (fits(plan, rooms())) { At {{ rooms() }} rooms: <strong>{{ money(at(plan, rooms())) }}</strong> }
                  @else { {{ plan.name }} is for up to {{ plan.limits?.['ROOMS'] }} rooms }
                </p>
                <ul class="plan__rows">
                  <li><span>Maximum rooms</span><strong>{{ cap(plan, 'ROOMS') }}</strong></li>
                  <li><span>Buildings</span><strong>{{ cap(plan, 'BUILDINGS') }}</strong></li>
                  <li><span>Team members</span><strong>{{ cap(plan, 'ADMINS') }}</strong></li>
                </ul>
                <ul class="plan__features">
                  @for (code of allFeatures(); track code) {
                    <li [class.no]="!(plan.features ?? []).includes(code)">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon((plan.features ?? []).includes(code) ? 'check' : 'cross')"/></svg>
                      <span>{{ feature(code) }}@if (!(plan.features ?? []).includes(code)) { <span class="visually-hidden"> (not included)</span> }</span>
                    </li>
                  }
                </ul>
                <a [class]="'btn ' + (best()?.id === plan.id ? 'btn-primary' : 'btn-secondary')" [routerLink]="RoutePaths.signup">Start free trial</a>
              </article>
            }
          </div>
          @if (pricing()?.trial; as trial) {
            <p class="trial-note"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon('clock')"/></svg>
              <span>Every account starts with a <strong>{{ trial.trialDays }}-day free trial</strong> ({{ trialScope(trial) }}). When it ends, choose a plan to keep adding and changing things — nothing is charged automatically, and nothing you added is lost.</span></p>
          }
          @if (video()) {
            <p class="not-ready">Not ready to set up? <button type="button" class="text-cta inline" (click)="openVideo()">Watch the demo first</button></p>
          }
          @if (maxRooms(); as max) {
            <p class="muted">Need more than {{ max }} rooms? {{ contactPhrase() }}</p>
          }
          @if (pricingFailed()) {
            <p class="muted">Prices could not be loaded just now. Every account starts with a free trial, and you can see all prices once you sign up.</p>
          }
        </section>

        <!-- GETTING STARTED -->
        <section class="section" aria-labelledby="start">
          <header class="section__head">
            <p class="eyebrow">Getting started</p>
            <h2 id="start">Your first building in one sitting</h2>
            <p class="section__lede">Start with one building. Add the rest when you are sure.</p>
          </header>
          <ol class="steps">
            @for (step of steps; track step.title) {
              <li class="step">
                <span class="step__n" aria-hidden="true">{{ $index + 1 }}</span>
                <div><span class="step__time"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon('clock')"/></svg>{{ step.time }}</span>
                  <h3>{{ step.title }}</h3><p>{{ step.body }}</p></div>
              </li>
            }
          </ol>
          <div class="hero__actions">
            <a class="btn btn-primary btn-xl" [routerLink]="RoutePaths.signup">Start free trial</a>
            @if (demoLink(); as demo) {
              <a class="btn btn-secondary btn-xl" [href]="demo" target="_blank" rel="noopener">Book a demo</a>
            }
          </div>
          @if (whatsappLink()) {
            <p class="help-line">Stuck on a step? Message us on WhatsApp and we will set up your first building with you.</p>
          }
        </section>

        <!-- QUESTIONS: one column, cost first, the first three open. -->
        <section class="section" id="faq" aria-labelledby="questions">
          <header class="section__head">
            <p class="eyebrow">Questions landlords ask</p>
            <h2 id="questions">Before you sign up</h2>
          </header>
          <div class="faq">
            @for (item of faq(); track item.q; let i = $index) {
              <details class="faq__item" [open]="i < 3" [attr.id]="item.id ?? null">
                <summary><span>{{ item.q }}</span><svg class="faq__chev" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon('chevron')"/></svg></summary>
                <p>{{ item.a }}</p>
              </details>
            }
          </div>
          @if (whatsappLink(); as wa) {
            <p class="unsure">Still have questions? <a [href]="wa" target="_blank" rel="noopener">Chat with us on WhatsApp</a></p>
          } @else if (info()?.supportEmail; as email) {
            <p class="unsure">Still have questions? <a [href]="'mailto:' + email">Email us</a></p>
          }
        </section>

        <!-- CTA -->
        <section class="cta">
          <div class="cta__copy">
            <h2>Make next month the last one you keep in a notebook.</h2>
            <p>Add one building, bring your tenants in, and from next month every bill, payment and receipt keeps its own record.</p>
          </div>
          <div class="cta__side">
          <div class="cta__actions">
            @if (video()) {
              <button type="button" class="btn btn-xl cta__btn" (click)="openVideo()">
                <svg class="i i--fill" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon('play')"/></svg>Watch the demo</button>
              <a class="btn btn-xl cta__btn cta__btn--ghost" [routerLink]="RoutePaths.signup">Start free trial</a>
            } @else {
              <a class="btn btn-xl cta__btn" [routerLink]="RoutePaths.signup">Start free trial</a>
            }
          </div>
          <p class="cta__terms">{{ trialTerms() }}</p>
          </div>
        </section>
      </main>

      <footer class="foot" id="contact">
        <div class="foot__brand">
          <span class="brand"><span class="brand__mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icon('home')"/></svg></span><span class="brand__name">Unitwise</span></span>
          <p>Tenant, rent and property records for Kenyan landlords and letting agents.</p>
        </div>
        <nav class="foot__col" aria-label="Product">
          <h2>Product</h2>
          <button type="button" (click)="scrollTo('how-it-works')">How it works</button>
          <button type="button" (click)="scrollTo('features')">Features</button>
          <button type="button" (click)="scrollTo('pricing')">Pricing</button>
          <button type="button" (click)="scrollTo('faq')">FAQ</button>
        </nav>
        <nav class="foot__col" aria-label="Legal">
          <h2>Legal</h2>
          <a [routerLink]="RoutePaths.terms">Terms of service</a>
          <a [routerLink]="RoutePaths.privacyPolicy">Privacy policy</a>
        </nav>
        @if (hasContact()) {
          <div class="foot__col">
            <h2>Contact and support</h2>
            @if (info()?.supportPhone; as phone) { <a [href]="'tel:' + phone">{{ phone }}</a> }
            @if (whatsappLink(); as wa) { <a [href]="wa" target="_blank" rel="noopener">WhatsApp us</a> }
            @if (info()?.supportEmail; as email) { <a [href]="'mailto:' + email">{{ email }}</a> }
            @if (info()?.supportHours; as hours) { <span class="foot__hours">{{ hours }}</span> }
          </div>
        }
        @if ((info()?.socialLinks ?? []).length > 0) {
          <nav class="foot__col" aria-label="Social">
            <h2>Follow us</h2>
            @for (link of info()!.socialLinks!; track link.url) { <a [href]="link.url" target="_blank" rel="noopener">{{ link.label }}</a> }
          </nav>
        }
        <div class="foot__legal">
          <span>© {{ year }} {{ info()?.companyName || 'Unitwise' }}</span>
          @if (info()?.companyRegistration; as reg) { <span>Reg. {{ reg }}</span> }
          @if (info()?.dataProtectionRegistration; as dpa) { <span>Registered with the ODPC · {{ dpa }}</span> }
          @if (info()?.companyAddress; as address) { <span>{{ address }}</span> }
          <span>M-Pesa is a trademark of Safaricom PLC.</span>
        </div>
      </footer>

      <!-- The demo plays here, on the page. The player is only created when opened, and removed on close. -->
      <dialog #player class="player" aria-label="Unitwise demo video" (close)="playing.set(false)" (click)="onPlayerClick($event)">
        <div class="player__box">
          <button type="button" class="player__close" (click)="closeVideo()" aria-label="Close the video">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon('cross')"/></svg></button>
          <div class="player__frame">
            @if (playing()) {
              @switch (video()?.kind) {
                @case ('file') { <video [src]="$any(video()).src" controls autoplay playsinline></video> }
                @case ('embed') { <iframe [src]="$any(video()).src" title="Unitwise demo video" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen></iframe> }
              }
            }
          </div>
          <div class="player__next">
            <p>Like what you see?</p>
            <a class="btn btn-primary" [routerLink]="RoutePaths.signup" (click)="closeVideo()">Start free trial</a>
            @if (demoLink(); as demo) {
              <a class="btn btn-secondary" [href]="demo" target="_blank" rel="noopener">Book a demo</a>
            }
          </div>
        </div>
      </dialog>
    </div>
  `,
  styles: [`
    :host { display: block; background: var(--surface); font-size: 1rem; line-height: 1.6; color: var(--text); }
    .skip { position: absolute; left: -999px; top: 0; z-index: 100; padding: var(--space-2) var(--space-3); background: var(--surface); }
    .skip:focus { left: var(--space-2); top: var(--space-2); }
    .landing { --gutter: clamp(1rem, 5vw, 4rem); display: grid; }
    main { display: grid; gap: clamp(3.5rem, 8vw, 6rem); padding-bottom: clamp(3rem, 6vw, 5rem); outline: none; }
    h1, h2, h3 { color: var(--text); }
    :where(a, button, summary, input):focus-visible { outline: 3px solid var(--primary); outline-offset: 2px; }
    .i { width: 1.25rem; height: 1.25rem; flex: none; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .btn { min-height: 2.75rem; font-size: 1rem; }
    .btn-xl { min-height: 3.25rem; padding-inline: 1.75rem; font-size: 1.1rem; font-weight: var(--weight-bold); }
    .btn-primary { box-shadow: var(--shadow-hover); }
    .muted { color: var(--text-muted); }
    .i--fill { fill: currentColor; stroke: none; }
    .btn .i { width: 1.15rem; height: 1.15rem; margin-right: var(--space-1-5); }
    .text-link { font-weight: var(--weight-bold); color: var(--primary-strong); text-underline-offset: 3px; }

    /* ---- top bar ---- */
    .bar { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; gap: var(--space-4);
      padding: var(--space-2-5) var(--gutter); background: color-mix(in srgb, var(--surface) 94%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--border); }
    .brand { display: inline-flex; align-items: center; gap: var(--space-2-5); text-decoration: none; color: var(--text); }
    .brand__mark { display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border-radius: 10px; background: var(--primary); color: var(--on-accent); }
    .brand__mark svg { width: 1.3rem; height: 1.3rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .brand__name { font-weight: var(--weight-bold); font-size: 1.15rem; }
    .bar__links { display: flex; gap: var(--space-1); margin-left: auto; }
    .bar__link { min-height: 2.75rem; padding: 0 var(--space-3); border: 0; border-radius: var(--radius-sm); background: none; font: inherit; font-size: 1rem; font-weight: var(--weight-semibold); color: var(--text); cursor: pointer; }
    .bar__link:hover { background: var(--surface-2); }
    .bar__actions { display: flex; align-items: center; gap: var(--space-2); }
    .bar__signin { display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0 var(--space-2); color: var(--text); font-weight: var(--weight-semibold); text-decoration: none; }
    .bar__signin:hover { text-decoration: underline; }
    .bar__cta { min-height: 2.75rem; padding-inline: var(--space-4); }
    .bar__wa { display: grid; place-items: center; width: 2.75rem; height: 2.75rem; border-radius: 50%; color: var(--whatsapp-ink); }
    .bar__wa:hover { background: var(--surface-2); }
    .bar__short { display: none; }
    .bar__wa svg { width: 1.5rem; height: 1.5rem; fill: none; stroke: currentColor; stroke-width: 1.8; }
    @media (max-width: 1060px) { .bar__links { display: none; } .bar__actions { margin-left: auto; } }

    /* ---- hero ---- */
    .hero { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: clamp(2rem, 4vw, 3rem); align-items: center;
      padding: clamp(2rem, 5vw, 4rem) var(--gutter) 0; }
    .hero__copy { display: grid; gap: var(--space-4); align-content: start; }
    .eyebrow-pill { justify-self: start; margin: 0; padding: var(--space-1-5) var(--space-3); border-radius: 999px; background: var(--primary-tint);
      color: var(--primary-strong); font-size: 1rem; font-weight: var(--weight-bold); }
    .hero h1 { margin: 0; font-size: clamp(2.3rem, 4.6vw, 3.6rem); line-height: 1.06; letter-spacing: -0.035em; font-weight: 800; text-wrap: balance; }
    .lede { margin: 0; max-width: 40rem; font-size: clamp(1.1rem, 1.6vw, 1.25rem); }
    .hero__actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
    .hero__links { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); }
    .text-cta { display: inline-flex; align-items: center; gap: var(--space-2); min-height: 2.75rem; padding: 0; border: 0; background: none;
      font: inherit; font-weight: var(--weight-bold); color: var(--primary-strong); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
    .text-cta.inline { min-height: 0; margin-left: var(--space-1); }
    .terms { margin: 0; color: var(--text); font-size: 1rem; }
    .ticks { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); margin: 0; padding: var(--space-3) 0 0; list-style: none;
      border-top: 1px solid var(--border); font-weight: var(--weight-semibold); }
    .ticks li { display: flex; align-items: flex-start; gap: var(--space-2); line-height: 1.35; }
    .ticks .i { color: var(--primary-strong); }

    /* ---- product art ---- */
    .hero__art { position: relative; margin: 0; padding-bottom: 2.75rem; }
    .laptop__screen { padding: 0.6rem; border-radius: 14px 14px 0 0; background: var(--device-frame); box-shadow: var(--shadow-lg); }
    .laptop__base { height: 0.8rem; margin: 0 -4%; border-radius: 0 0 14px 14px; background: linear-gradient(var(--device-base-from), var(--device-base-to)); }
    /* The screenshots in assets/landing: shown whole at the top, cropped at the bottom if taller than the frame. */
    .shot { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; object-fit: cover; object-position: top; border-radius: 6px; background: var(--preview-light-bg); }
    .shot--phone { aspect-ratio: 390 / 700; border-radius: 18px; background: var(--preview-light-surface); }
    img.mini { display: block; width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; object-position: top; padding: 0; }
    .phone { width: 11rem; padding: 0.45rem; border-radius: 24px; background: var(--device-frame); box-shadow: var(--shadow-lg); }
    .phone--hero { position: absolute; right: -0.5rem; bottom: 0; }
    .sample { position: absolute; left: 0; bottom: 0; max-width: 60%; font-size: 0.95rem; color: var(--text); }
    /* The screens are the video's poster: one tap anywhere on them plays the demo. */
    .play { position: absolute; inset: 0 0 2.75rem; z-index: 2; display: grid; place-content: center; justify-items: center; gap: var(--space-2);
      border: 0; border-radius: 14px; background: transparent; font: inherit; cursor: pointer; }
    .play__disc { display: grid; place-items: center; width: 5rem; height: 5rem; border-radius: 50%; background: var(--primary); color: var(--on-accent);
      box-shadow: 0 0 0 10px color-mix(in srgb, var(--primary) 22%, transparent), var(--shadow-lg); transition: transform .2s ease; }
    .play__disc svg { width: 2rem; height: 2rem; margin-left: 0.25rem; fill: currentColor; }
    .play__label { padding: var(--space-1) var(--space-3); border-radius: 999px; background: var(--surface); color: var(--text); font-weight: var(--weight-bold); box-shadow: var(--shadow-sm); }
    .play:hover .play__disc { transform: scale(1.06); }
    .play:active .play__disc { transform: scale(0.97); }

    /* ---- facts ---- */
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); gap: var(--space-3); margin: 0 var(--gutter); }
    .fact { display: grid; gap: var(--space-1); align-content: start; padding: var(--space-4) var(--space-5); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); box-shadow: var(--shadow-sm); }
    .fact__icon { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; margin-bottom: var(--space-1); border-radius: 12px; background: var(--primary-tint); color: var(--primary-strong); }
    .fact strong { font-size: 1.2rem; line-height: 1.25; font-variant-numeric: tabular-nums; }

    /* ---- sections ---- */
    .section { display: grid; gap: var(--space-6); padding-inline: var(--gutter); scroll-margin-top: 5rem; }
    /* Grid children may shrink below their content: the swiped rows scroll instead of widening the page. */
    main > *, .section > *, .tenant > *, .hero > * { min-width: 0; }
    .section--tint { padding-block: clamp(3rem, 6vw, 4.5rem); background: var(--surface-2); }
    .section__head { display: grid; gap: var(--space-2); max-width: 46rem; }
    .eyebrow { margin: 0; font-size: 1rem; font-weight: var(--weight-bold); color: var(--primary-strong); }
    .section__head h2 { margin: 0; font-size: clamp(1.7rem, 3.6vw, 2.5rem); line-height: 1.15; letter-spacing: -0.025em; text-wrap: balance; }
    .section__lede { margin: 0; font-size: 1.1rem; }
    .sample-note { margin: 0; font-size: 0.95rem; color: var(--text); }

    .quotes { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); gap: var(--space-4); }
    .quote { margin: 0; padding: var(--space-5); border-radius: var(--radius-md); background: var(--surface-2); }
    .quote blockquote { margin: 0 0 var(--space-3); font-size: 1.1rem; }

    /* ---- before / after: one grid for the header and every row, so the columns line up ---- */
    .compare { display: grid; gap: var(--space-2); }
    .compare__grid { display: grid; grid-template-columns: 13rem minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-3); }
    .compare__head span { padding-left: var(--space-4); font-weight: var(--weight-bold); }
    .compare__head .yes { color: var(--success); }
    .compare__row h3 { display: flex; align-items: center; gap: var(--space-2); margin: 0; font-size: 1.05rem; }
    .compare__row h3 .i { color: var(--primary-strong); }
    .compare__row p { display: flex; align-items: flex-start; gap: var(--space-2-5); margin: 0; padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); }
    .compare__before { background: var(--neutral-tint); color: var(--text-muted); }
    .compare__after { background: var(--success-tint); color: var(--text); font-weight: var(--weight-semibold); }
    /* The column headings say which side is which on a wide screen; on a phone each line says it itself. */
    .compare__tag { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .mark { flex: none; display: grid; place-items: center; width: 1.75rem; height: 1.75rem; border-radius: 50%; }
    .mark svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; }
    .mark--no { background: var(--danger-tint); color: var(--danger); }
    .mark--yes { background: var(--success); color: var(--on-primary); }

    /* ---- four steps ---- */
    .flow { position: relative; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-4); margin: 0; padding: 0; list-style: none; }
    .flow::before { content: ''; position: absolute; left: 3rem; right: 3rem; top: 0.85rem; height: 2px; background: var(--primary); opacity: 0.35; }
    .flow__step { position: relative; display: grid; gap: var(--space-2-5); align-content: start; }
    .flow__step h3 { margin: 0; font-size: 1.15rem; }
    .flow__step p { margin: 0; }
    .flow__n { justify-self: start; position: relative; padding: 0.15rem 0.75rem; border-radius: 999px; background: var(--primary); color: var(--on-accent); font-size: 0.95rem; font-weight: var(--weight-bold); }
    .mini { display: grid; gap: 0.2rem; padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); box-shadow: var(--shadow-sm); color: var(--text); }
    .dots { display: none; }

    /* ---- tenants ---- */
    .tenant { display: grid; grid-template-columns: 17rem minmax(0, 1fr); gap: clamp(2rem, 5vw, 4rem); align-items: center; }
    .tenant__phone { display: grid; gap: var(--space-2); justify-items: center; margin: 0; }
    .phone--large { width: 16rem; }
    .tenant__copy { display: grid; gap: var(--space-5); }
    .groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr)); gap: var(--space-4); }
    .group { padding: var(--space-4); border-radius: var(--radius-md); background: var(--surface); box-shadow: var(--shadow-sm); color: var(--text); }
    .group h3 { display: flex; align-items: center; gap: var(--space-2); margin: 0 0 var(--space-2); font-size: 1.15rem; }
    .group h3 .i { color: var(--primary-strong); }
    .group ul { display: grid; gap: var(--space-1-5); margin: 0; padding-left: 1.1rem; }

    /* ---- features: a 3×2 grid of equal cards ---- */
    .caps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-4); align-items: stretch; }
    .cap { display: grid; align-content: start; gap: var(--space-3); padding: var(--space-5); border-radius: var(--radius-md); background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow-sm); }
    .cap summary { display: flex; align-items: center; gap: var(--space-2-5); list-style: none; cursor: default; pointer-events: none; }
    .cap summary::-webkit-details-marker { display: none; }
    .cap h3 { margin: 0; font-size: 1.15rem; }
    .cap__icon { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; border-radius: 12px; background: var(--primary-tint); color: var(--primary-strong); }
    .cap__chevron { display: none; }
    .cap__list { display: grid; gap: var(--space-1-5); margin: 0; padding-left: 1.2rem; }
    .more { justify-self: start; display: inline-flex; align-items: center; gap: var(--space-1); min-height: 2.75rem; padding: 0; border: 0; background: none;
      font: inherit; font-weight: var(--weight-bold); color: var(--primary-strong); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
    .more__chev { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 2.4; transform: rotate(90deg); }
    .more__chev.up { transform: rotate(-90deg); }

    /* ---- roles ---- */
    .roles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); }
    /* Icon and title on one row; the sees / doesn't-see lines run the full width under them. */
    .role { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-2) var(--space-3); align-items: center; align-content: start; padding: var(--space-4); border-radius: var(--radius-md); background: var(--surface); }
    .role__line { grid-column: 1 / -1; }
    .role__icon { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; border-radius: 12px; background: var(--primary-tint); color: var(--primary-strong); }
    .role h3 { margin: 0; font-size: 1.1rem; }
    .role__line { display: flex; align-items: flex-start; gap: var(--space-2); margin: 0; }
    .role__line strong { display: block; }

    /* ---- pricing ---- */
    .calc { display: grid; gap: var(--space-2); max-width: 40rem; padding: var(--space-4) var(--space-5); border-radius: var(--radius-md); background: var(--surface-2); }
    .calc__label { font-size: 1.1rem; }
    .calc input { width: 100%; min-height: 2.75rem; accent-color: var(--primary); }
    .calc__result { margin: 0; font-size: 1.05rem; }
    .plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); gap: var(--space-4); align-items: stretch; }
    .plan { display: grid; grid-template-rows: auto auto auto auto auto 1fr auto; gap: var(--space-2); padding: var(--space-5); border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--surface); box-shadow: var(--shadow-sm); }
    /* Positioned, so screen-reader-only text inside stays inside the swiped row instead of widening the page. */
    .plan, .flow__step { position: relative; }
    .plan--best { border: 2px solid var(--primary); box-shadow: var(--shadow-raised); }
    .plan__head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); }
    .plan h3 { margin: 0; font-size: 1.25rem; }
    .badge { padding: 0.1rem 0.6rem; border-radius: 999px; background: var(--primary); color: var(--on-accent); font-size: 0.85rem; font-weight: var(--weight-bold); }
    .plan__price { margin: 0; font-size: 1.9rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; }
    .plan__price span { font-size: 1rem; font-weight: var(--weight-regular); color: var(--text-muted); }
    .plan__how, .plan__at { margin: 0; }
    .plan__at { padding: var(--space-1-5) var(--space-2-5); border-radius: var(--radius-sm); background: var(--surface-2); }
    .plan__rows { display: grid; margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--border); }
    .plan__rows li { display: flex; justify-content: space-between; gap: var(--space-2); padding: var(--space-1-5) 0; border-bottom: 1px solid var(--border); }
    .plan__features { display: grid; gap: var(--space-1-5); align-content: start; margin: 0; padding: 0; list-style: none; }
    .plan__features li { display: flex; align-items: flex-start; gap: var(--space-2); }
    .plan__features svg { width: 1.1rem; height: 1.1rem; margin-top: 0.2rem; flex: none; fill: none; stroke: var(--success); stroke-width: 2.6; stroke-linecap: round; }
    .plan__features li.no { color: var(--text-muted); }
    .plan__features li.no svg { stroke: var(--text-subtle); stroke-width: 2; }
    .trial-note { display: flex; gap: var(--space-2-5); align-items: flex-start; margin: 0; padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); background: var(--primary-tint); }
    .trial-note .i { margin-top: 0.15rem; color: var(--primary-strong); }
    .not-ready { margin: 0; font-size: 1.1rem; }

    /* ---- getting started ---- */
    .steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); gap: var(--space-5); margin: 0; padding: 0; list-style: none; }
    .step { display: grid; grid-template-columns: auto 1fr; gap: var(--space-3); align-items: start; }
    .step h3 { margin: var(--space-1) 0; font-size: 1.15rem; }
    .step p { margin: 0; }
    .step__n { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; border-radius: 50%; background: var(--primary); color: var(--on-accent); font-weight: var(--weight-bold); font-size: 1.1rem; }
    .step__time { display: inline-flex; align-items: center; gap: var(--space-1-5); padding: 0.15rem 0.65rem; border-radius: 999px; background: var(--primary-tint); color: var(--primary-strong); font-size: 0.95rem; font-weight: var(--weight-bold); }
    .step__time .i { width: 1rem; height: 1rem; }
    .help-line { margin: 0; font-size: 1.05rem; }

    /* ---- questions: one centred column, a chevron on every row ---- */
    .faq { display: grid; gap: var(--space-2); width: 100%; max-width: 48rem; justify-self: center; }
    .section#faq .section__head { justify-self: center; width: 100%; max-width: 48rem; }
    .faq__item { border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); scroll-margin-top: 5rem; }
    .faq__item summary { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-height: 3.25rem; padding: var(--space-2) var(--space-4);
      font-weight: var(--weight-bold); font-size: 1.05rem; list-style: none; cursor: pointer; }
    .faq__item summary::-webkit-details-marker { display: none; }
    .faq__chev { flex: none; width: 1.25rem; height: 1.25rem; fill: none; stroke: currentColor; stroke-width: 2.2; transform: rotate(90deg); transition: transform .15s; }
    .faq__item[open] .faq__chev { transform: rotate(-90deg); }
    .faq__item p { margin: 0; padding: 0 var(--space-4) var(--space-4); }
    .unsure { justify-self: center; margin: 0; font-size: 1.1rem; }
    .unsure a { font-weight: var(--weight-bold); color: var(--primary-strong); }

    /* ---- closing call ---- */
    /* Words on the left, the actions on the right: the panel's width is used, not left empty beside a short heading. */
    .cta { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: var(--space-5) clamp(2rem, 5vw, 4rem); align-items: center;
      margin-inline: var(--gutter); padding: clamp(2rem, 5vw, 3.5rem); border-radius: 22px; background: var(--primary-strong); color: var(--on-primary); }
    .cta__copy, .cta__side { display: grid; gap: var(--space-3); justify-items: start; }
    .cta h2 { margin: 0; color: var(--on-primary); font-size: clamp(1.7rem, 3.6vw, 2.5rem); letter-spacing: -0.02em; line-height: 1.15; max-width: 26ch; }
    .cta p { margin: 0; max-width: 52ch; font-size: 1.1rem; }
    .cta__actions { display: flex; flex-wrap: wrap; gap: var(--space-3); }
    .cta__btn { min-height: 3.5rem; padding-inline: 2rem; background: var(--on-primary); color: var(--primary-strong); font-size: 1.15rem; }
    .cta__btn--ghost { background: transparent; color: var(--on-primary); box-shadow: inset 0 0 0 2px var(--on-primary); }
    .cta__btn--ghost:hover { background: color-mix(in srgb, var(--on-primary) 12%, transparent); }

    /* ---- the demo player ---- */
    .player { width: min(64rem, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); margin: auto; padding: 0; border: 0; border-radius: var(--radius-lg); background: var(--surface); color: var(--text); box-shadow: var(--shadow-lg); }
    .player::backdrop { background: rgb(0 0 0 / 0.72); }
    .player__box { position: relative; display: grid; }
    .player__frame { aspect-ratio: 16 / 9; background: #000; }
    .player__frame iframe, .player__frame video { display: block; width: 100%; height: 100%; border: 0; }
    .player__close { position: absolute; top: var(--space-2); right: var(--space-2); z-index: 1; display: grid; place-items: center; width: 2.75rem; height: 2.75rem;
      border: 0; border-radius: 50%; background: rgb(0 0 0 / 0.6); color: #fff; cursor: pointer; }
    .player__close svg { width: 1.25rem; height: 1.25rem; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; }
    .player__next { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); padding: var(--space-3) var(--space-4); }
    .player__next p { margin: 0 auto 0 0; font-weight: var(--weight-bold); }

    /* ---- scroll motion: only where the order is the point. Hidden only once the script has added .rv ---- */
    .compare__row.rv { opacity: 0; transform: translateY(14px); transition: opacity .4s ease, transform .4s ease; }
    .compare__row.rv .compare__after { opacity: 0; transform: translateX(-10px); transition: opacity .4s ease .22s, transform .4s ease .22s; }
    .compare__row.rv.in, .compare__row.rv.in .compare__after { opacity: 1; transform: none; }
    .flow.rv .flow__step { opacity: 0; transform: translateY(16px); transition: opacity .45s ease, transform .45s ease; transition-delay: calc(var(--i, 0) * 140ms); }
    .flow.rv.in .flow__step { opacity: 1; transform: none; }
    .flow.rv::before { transform: scaleX(0); transform-origin: left; transition: transform .9s ease .1s; }
    .flow.rv.in::before { transform: none; }
    .cta__terms { font-size: 1rem; opacity: 0.9; }
    @media (max-width: 900px) { .cta { grid-template-columns: minmax(0, 1fr); } }

    /* ---- footer ---- */
    .foot { display: flex; flex-wrap: wrap; gap: var(--space-6) clamp(2rem, 6vw, 5rem); padding: var(--space-8) var(--gutter) var(--space-6); border-top: 1px solid var(--border); background: var(--surface-2); }
    .foot__brand { flex: 1 1 18rem; }
    .foot__brand p { margin: var(--space-2) 0 0; max-width: 30ch; }
    .foot__col { display: grid; gap: 0; align-content: start; }
    .foot__col h2 { margin: 0 0 var(--space-1); font-size: 1rem; }
    .foot__col a, .foot__col button { display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0; border: 0; background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer; }
    .foot__col a:hover, .foot__col button:hover { text-decoration: underline; }
    .foot__hours { padding: var(--space-1) 0; }
    .foot__legal { flex: 1 1 100%; display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--border); font-size: 0.95rem; }


    @media (max-width: 1060px) {
      .hero, .tenant { grid-template-columns: minmax(0, 1fr); }
      .hero__art { max-width: 36rem; }
      .caps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .roles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .flow { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: min(80%, 18rem); overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: var(--space-2); scrollbar-width: none; }
      .flow__step { scroll-snap-align: start; }
      .flow::before { display: none; }
      .dots { display: flex; align-items: center; gap: var(--space-2); }
      .dots span:not(.dots__hint) { width: 0.6rem; height: 0.6rem; border-radius: 50%; background: var(--border-strong); }
      .dots span.on { background: var(--primary); width: 1.4rem; border-radius: 999px; }
      .dots__hint { margin-left: auto; font-weight: var(--weight-semibold); color: var(--text-muted); }
    }
    @media (max-width: 700px) {
      .ticks { grid-template-columns: minmax(0, 1fr); }
      /* Both actions on one row: they share the width, and only wrap on the narrowest phones. */
      .hero__actions { gap: var(--space-2); }
      .hero__actions .btn-xl { flex: 1 1 auto; padding-inline: 0.7rem; font-size: 1rem; white-space: nowrap; }
      .hero__actions .btn-xl .i { width: 0.95rem; height: 0.95rem; margin-right: 0.35rem; }
      /* One card of short rows, icon beside the words, instead of four tall cards. */
      .facts { gap: 0; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); box-shadow: var(--shadow-sm); overflow: hidden; }
      .fact { grid-template-columns: auto minmax(0, 1fr); column-gap: var(--space-3); row-gap: 0; align-items: center;
        padding: var(--space-3) var(--space-4); border: 0; border-radius: 0; box-shadow: none; }
      .fact + .fact { border-top: 1px solid var(--border); }
      .fact__icon { grid-row: span 2; width: 2.25rem; height: 2.25rem; margin: 0; border-radius: 10px; }
      .fact strong { font-size: 1.05rem; }
      .fact span:not(.fact__icon) { font-size: 0.95rem; line-height: 1.4; }
      /* One phone, at the width of the screen, after the action — the laptop is too small to read here. */
      .laptop { display: none; }
      .hero__art { justify-self: center; padding-bottom: 0; display: grid; gap: var(--space-2); justify-items: center; }
      .phone--hero { position: static; width: min(17rem, 80vw); }
      .play { inset: 0 0 2.25rem; }
      .play__disc { width: 4.25rem; height: 4.25rem; }
      .player { width: 100vw; max-width: 100vw; border-radius: 0; }
      .player__next .btn { flex: 1 1 auto; }
      .player__next p { flex: 1 1 100%; }
      .sample { position: static; max-width: none; text-align: center; }
      .compare__head { display: none; }
      .compare { gap: var(--space-5); }
      .compare__grid { grid-template-columns: minmax(0, 1fr); gap: var(--space-1-5); }
      .compare__tag { position: static; display: block; width: auto; height: auto; overflow: visible; clip-path: none; white-space: normal;
        margin-bottom: 0.1rem; font-size: 0.8rem; font-weight: var(--weight-bold); letter-spacing: 0.04em; text-transform: uppercase; }
      .compare__before .compare__tag { color: var(--text-muted); }
      .compare__after .compare__tag { color: var(--success); }
      .tenant__phone { order: -1; }
      .phone--large { width: min(16rem, 80vw); }
      /* Accordions: the titles scan, a tap opens one. */
      .caps { grid-template-columns: minmax(0, 1fr); gap: var(--space-2); }
      .cap { padding: var(--space-3) var(--space-4); }
      .cap summary { pointer-events: auto; cursor: pointer; min-height: 2.75rem; }
      .cap__chevron { display: block; margin-left: auto; width: 1.25rem; height: 1.25rem; fill: none; stroke: currentColor; stroke-width: 2.2; transform: rotate(90deg); }
      .cap[open] .cap__chevron { transform: rotate(-90deg); }
      .roles { grid-template-columns: minmax(0, 1fr); }
      /* Plans side by side, swiped; the one that fits comes first. */
      .plans { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: 85%; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: var(--space-2); }
      .plan { scroll-snap-align: start; }
      .plan--best { order: -1; }
      .bar__signin { padding: 0; }
      /* Columns side by side, the brand and the small print across both: half the height of a single stack. */
      .foot { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4) var(--space-5); padding-block: var(--space-6) var(--space-4); }
      .foot__brand, .foot__legal { grid-column: 1 / -1; }
      .foot__brand { display: grid; gap: var(--space-1); }
      .foot__brand p { margin: 0; max-width: none; font-size: 0.95rem; }
      .foot__col a, .foot__col button { min-height: 2.5rem; }
      .foot__legal { gap: 0 var(--space-3); padding-top: var(--space-3); font-size: 0.85rem; color: var(--text-muted); }
    }
    /* No floating bar at the bottom: the header's own button stays in reach, shortened to fit a phone. */
    @media (max-width: 480px) {
      .bar { gap: var(--space-2); }
      .bar__actions { gap: var(--space-1); }
      .bar__long { display: none; }
      .bar__short { display: inline; }
      .bar__cta { padding-inline: var(--space-3); }
      .bar__cta .i { width: 0.9rem; height: 0.9rem; margin-right: 0.3rem; }
      .bar__signin, .bar__cta { white-space: nowrap; }
      .bar__signin { padding-inline: var(--space-1); }
    }
    @media (max-width: 400px) {
      .bar__cta { padding-inline: var(--space-2-5); }
      .bar__cta .i { display: none; }
      .bar__wa { width: 2.5rem; }
    }
    /* The very narrowest phones keep the logo and drop the name beside it, so every action still fits. */
    @media (max-width: 340px) { .bar .brand__name { display: none; } }
    @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; transition: none !important; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LandingPageComponent implements OnInit, OnDestroy {
  readonly RoutePaths = RoutePaths;
  readonly session = inject(AuthSessionService);
  private readonly appInfo = inject(AppManagementService);
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly player = viewChild<ElementRef<HTMLDialogElement>>('player');
  private faqSchema: HTMLScriptElement | null = null;
  private mediaQuery: MediaQueryList | null = null;
  private readonly onMedia = (event: MediaQueryListEvent) => this.narrow.set(event.matches);

  readonly year = new Date().getFullYear();
  readonly info = signal<AppInfo | null>(null);
  readonly stats = signal<PlatformStats | null>(null);
  readonly pricing = signal<PublicPricing | null>(null);
  readonly pricingFailed = signal(false);
  readonly rooms = signal(30);
  readonly flowIndex = signal(0);
  readonly narrow = signal(false);
  readonly expanded = signal<ReadonlySet<number>>(new Set());
  readonly playing = signal(false);
  readonly heroArtLabel = 'The landlord’s rent screen on a laptop, and a tenant’s bill on a phone';
  readonly countFn = (value: number) => this.count(value);
  readonly moneyFn = (value: number) => this.money(value);

  icon(name: string): string {
    return ICONS[name] ?? '';
  }

  readonly hasContact = computed(() => !!(this.info()?.supportPhone || this.info()?.supportWhatsapp || this.info()?.supportEmail));

  readonly anchors = computed(() => [
    { id: 'how-it-works', label: 'How it works' },
    { id: 'features', label: 'Features' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'faq', label: 'FAQ' },
    ...(this.hasContact() ? [{ id: 'contact', label: 'Contact' }] : [])
  ]);

  /** wa.me wants the number in international form, digits only. */
  private wa(text: string): string | null {
    const raw = this.info()?.supportWhatsapp;
    if (!raw) return null;
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('0')) digits = '254' + digits.slice(1);
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  }

  readonly whatsappLink = computed(() => this.wa('Hi, I would like to know more about Unitwise.'));

  /** "Book a demo" goes where a person answers: WhatsApp, else email. */
  readonly demoLink = computed(() => this.wa('Hi, I would like a demo of Unitwise.')
    ?? (this.info()?.supportEmail ? `mailto:${this.info()!.supportEmail}?subject=${encodeURIComponent('Unitwise demo')}` : null));

  readonly contactPhrase = computed(() => this.whatsappLink() || this.info()?.supportEmail || this.info()?.supportPhone
    ? 'Talk to us — see Contact below.' : 'Sign up and ask us from the app.');

  /** The demo link from App management, turned into something that plays on this page. */
  readonly video = computed<DemoVideo | null>(() => {
    const raw = this.info()?.demoVideoUrl?.trim();
    if (!raw) return null;
    let url: URL;
    try { url = new URL(raw); } catch { return null; }
    // Uploaded under App management: always a video file, whatever its URL looks like.
    if (this.info()?.demoVideoSource === 'FILE') return { kind: 'file', src: url.href };
    const host = url.hostname.replace(/^(www\.|m\.)/, '');
    const id = (value: string | null | undefined) => (value && /^[\w-]{6,20}$/.test(value) ? value : null);
    let youtube: string | null = null;
    if (host === 'youtu.be') youtube = id(url.pathname.slice(1));
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      youtube = id(url.searchParams.get('v')) ?? id(url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1]);
    }
    if (youtube) {
      return { kind: 'embed', src: this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.youtube-nocookie.com/embed/${youtube}?autoplay=1&rel=0&modestbranding=1&cc_load_policy=1`) };
    }
    const vimeo = host === 'vimeo.com' || host === 'player.vimeo.com' ? url.pathname.match(/(\d{6,12})/)?.[1] : null;
    if (vimeo) return { kind: 'embed', src: this.sanitizer.bypassSecurityTrustResourceUrl(`https://player.vimeo.com/video/${vimeo}?autoplay=1&texttrack=en`) };
    if (url.protocol === 'https:' && /\.(mp4|webm)$/i.test(url.pathname)) return { kind: 'file', src: url.href };
    return { kind: 'link', src: url.href };
  });

  openVideo(): void {
    const video = this.video();
    if (!video) return;
    if (video.kind === 'link') {
      this.document.defaultView?.open(video.src, '_blank', 'noopener');
      return;
    }
    this.playing.set(true);
    this.player()?.nativeElement.showModal();
  }

  closeVideo(): void {
    this.player()?.nativeElement.close();
  }

  /** A tap on the dimmed area outside the player closes it. */
  onPlayerClick(event: MouseEvent): void {
    if (event.target === this.player()?.nativeElement) this.closeVideo();
  }

  /** "Free for 14 days, up to 10 rooms." — the short form, for beside a link. */
  readonly trialLead = computed(() => {
    const trial = this.pricing()?.trial;
    return trial ? `free for ${trial.trialDays} days, ${this.trialScope(trial)}.` : 'free to try.';
  });

  readonly trialTerms = computed(() => {
    const trial = this.pricing()?.trial;
    const lead = trial ? `Free for ${trial.trialDays} days, ${this.trialScope(trial)}.` : 'Free to try.';
    return `${lead} No card or PayBill needed. When it ends you choose a plan — nothing is charged automatically.`;
  });

  readonly vatText = computed(() => {
    const rate = Number(this.pricing()?.vatRate) || 0;
    return rate > 0 ? `plus VAT at ${Math.round(rate * 1000) / 10}%` : 'with no VAT added';
  });

  /** Every feature any plan has, in one order, so each card lists the same rows. */
  readonly allFeatures = computed(() => {
    const seen = new Set<string>();
    for (const plan of this.pricing()?.plans ?? []) (plan.features ?? []).forEach((code) => seen.add(code));
    return [...seen].sort((a, b) => this.countWith(b) - this.countWith(a) || featureLabel(a).localeCompare(featureLabel(b)));
  });

  readonly maxRooms = computed(() => {
    const caps = (this.pricing()?.plans ?? []).map((plan) => plan.limits?.['ROOMS']);
    return caps.length && caps.every((cap) => cap != null) ? Math.max(...(caps as number[])) : null;
  });

  readonly sliderMax = computed(() => Math.max(50, this.maxRooms() ?? 200));

  /** The cheapest plan that allows this many rooms. */
  readonly best = computed(() => {
    const rooms = this.rooms();
    return (this.pricing()?.plans ?? []).filter((plan) => this.fits(plan, rooms))
      .sort((a, b) => this.at(a, rooms) - this.at(b, rooms))[0] ?? null;
  });

  readonly faq = computed<{ q: string; a: string; id?: string }[]>(() => {
    const info = this.info();
    const ways = [info?.supportWhatsapp ? 'WhatsApp' : null, info?.supportPhone ? 'phone' : null, info?.supportEmail ? 'email' : null].filter(Boolean);
    return [
      { q: 'What does it cost?', a: `${this.trialTerms()} After that you pay by the rooms you manage — see Pricing above. You are invoiced after each month ends, and you can change plan any time.` },
      ...(this.video() || this.demoLink() ? [{ q: 'Can I see it before I sign up?', a: [this.video() ? 'Yes. Watch the demo at the top of this page: it shows billing, M-Pesa collection, confirming payments and reminding tenants who are behind, on real screens.' : 'Yes.', this.demoLink() ? 'Or book a demo and we will walk you through it with your own buildings in mind.' : ''].filter(Boolean).join(' ') }] : []),
      { q: 'How long does setup take, and can you help?', a: 'About an hour for your first building: add it, connect your PayBill, then bring your tenants in. You do not need to do every building at once.' + (ways.length ? ` If you would rather not do it alone, contact us by ${ways.join(', ')} and we will set up your first building with you.` : '') },
      { q: 'Does the rent pass through Unitwise?', a: 'No. Tenants pay into your own M-Pesa PayBill or till. Unitwise records and matches each payment; it never holds your money.' },
      { q: 'Is my data secure, and who can see it?', a: 'Each person sees only what their role allows: tenants see their own records, and staff see only the buildings you give them. Your M-Pesa API keys are stored encrypted and are never shown again after you enter them.' + (info?.dataProtectionRegistration ? ` We are registered with the Office of the Data Protection Commissioner (${info.dataProtectionRegistration}).` : '') },
      { q: 'What if a tenant pays without the right account number?', a: 'They report the payment from their phone by pasting the M-Pesa message, or you record it yourself the same way. Either way you confirm it, and it goes to the right room and month.' },
      { q: 'Which PayBill, till and bank options work?', a: 'Your own M-Pesa PayBill or Buy Goods till, for the whole agency or one per building. Bank and cash payments are recorded by you — paste a bank message and it fills itself in.' },
      { q: 'What are the M-Pesa fees, and who pays them?', a: 'Safaricom charges its usual PayBill or till fees, the same as today. Unitwise adds no fee on rent payments.' },
      { q: 'Do my tenants need to install an app?', a: 'No. Unitwise opens in any phone\'s browser — tenants sign in with the link you send them. Tenants without a smartphone keep paying into your PayBill as now, and you record or confirm it.' },
      { q: 'Can I get my records out in Excel?', a: 'Yes. Payments, tenants, rent, deposits, expenses and the reports all export as CSV, which opens straight in Excel.' },
      { q: 'Does it work if I have only one or two buildings?', a: 'Yes. Start with one, run a month on it, and add the rest once you have seen it work.' },
      { id: 'faq-access', q: 'How does access for my staff work?', a: 'You give each person a role and either the whole agency or chosen buildings. A caretaker given one building sees that building\'s tenants, readings and repairs — not your other properties or totals.' },
      { q: 'Is there a contract?', a: 'No long contract. Plans are monthly and invoiced after each month, and you can change plan any time.' },
      { q: 'What happens to my data if I stop?', a: 'Your account becomes read-only: you can still sign in, see and download your records. Tenants keep access to their own receipts.' },
      ...(ways.length ? [{ q: 'What support do you offer?', a: `A person answers by ${ways.join(', ')}${info?.supportHours ? `, ${info.supportHours}` : ''}.` }] : [])
    ];
  });

  ngOnInit(): void {
    this.title.setTitle('Unitwise — tenant and rent records for Kenyan landlords');
    this.meta.updateTag({ name: 'description', content: 'Keep every tenant, room, lease, bill and payment in one place. Property management for landlords and letting agents in Kenya, with rent paid by M-Pesa into your own PayBill and matched to the right tenant.' });

    this.mediaQuery = this.document.defaultView?.matchMedia('(max-width: 700px)') ?? null;
    this.narrow.set(!!this.mediaQuery?.matches);
    this.mediaQuery?.addEventListener('change', this.onMedia);

    firstValueFrom(this.appInfo.getAppInfo()).then((info) => { this.info.set(info); this.addFaqSchema(); }).catch(() => undefined);
    firstValueFrom(this.appInfo.getPlatformStats()).then((stats) => this.stats.set(stats)).catch(() => undefined);
    firstValueFrom(this.http.get<ApiResponse<PublicPricing>>(`${this.apiUrl}/${ApiUrls.publicPlans}`).pipe(map((r) => r.data)))
      .then((pricing) => { this.pricing.set(pricing); this.addFaqSchema(); })
      .catch(() => { this.pricingFailed.set(true); this.addFaqSchema(); });
  }

  ngOnDestroy(): void {
    this.faqSchema?.remove();
    this.mediaQuery?.removeEventListener('change', this.onMedia);
  }

  /** Questions and answers as structured data, so search results can show them. */
  private addFaqSchema(): void {
    this.faqSchema?.remove();
    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: this.faq().map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } }))
    });
    this.document.head.appendChild(script);
    this.faqSchema = script;
  }

  /** In-page jump without leaving the route; opens a question when it is the target. */
  scrollTo(id: string): void {
    const target = this.document.getElementById(id);
    if (target instanceof HTMLDetailsElement) target.open = true;
    const reduce = this.document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    if (id === 'main') (target as HTMLElement | null)?.focus();
  }

  onFlowScroll(event: Event): void {
    const list = event.target as HTMLElement;
    const step = list.firstElementChild as HTMLElement | null;
    if (step) this.flowIndex.set(Math.round(list.scrollLeft / (step.offsetWidth + 16)));
  }

  shownItems(group: { items: string[] }, index: number): string[] {
    return this.expanded().has(index) ? group.items : group.items.slice(0, 3);
  }

  toggleMore(index: number): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  /** The figure a plan is headed with: the base fee, or the room price when there is none. */
  headline(plan: BillingPlan): string {
    const base = Number(plan.baseFee) || 0;
    return base > 0 ? kes(base) : Number(plan.extraRoomPrice) > 0 ? `${kes(plan.extraRoomPrice)}/room` : 'KES 0';
  }

  /** What the headline price covers, without repeating it: "8 rooms included, then KES 120 per extra room". */
  how(plan: BillingPlan): string {
    const base = Number(plan.baseFee) || 0;
    const extra = Number(plan.extraRoomPrice) || 0;
    if (!extra) return base ? 'Any number of rooms, up to the maximum below' : 'Free';
    if (!base) return 'Every room at this price';
    return plan.includedRooms > 0
      ? `${plan.includedRooms} rooms included, then ${kes(extra)} per extra room`
      : `Plus ${kes(extra)} per room`;
  }

  fits(plan: BillingPlan, rooms: number): boolean {
    const cap = plan.limits?.['ROOMS'];
    return cap == null || rooms <= cap;
  }

  at(plan: BillingPlan, rooms: number): number {
    return (Number(plan.baseFee) || 0) + Math.max(0, rooms - (plan.includedRooms ?? 0)) * (Number(plan.extraRoomPrice) || 0);
  }

  cap(plan: BillingPlan, key: string): string {
    const value = plan.limits?.[key];
    return value == null ? 'Unlimited' : String(value);
  }

  trialScope(trial: BillingPlan): string {
    const rooms = trial.limits?.['ROOMS'];
    const buildings = trial.limits?.['BUILDINGS'];
    return [rooms != null ? `up to ${rooms} rooms` : null, buildings != null ? `${buildings} building${buildings === 1 ? '' : 's'}` : null]
      .filter(Boolean).join(', ') || 'every feature';
  }

  private countWith(code: string): number {
    return (this.pricing()?.plans ?? []).filter((plan) => (plan.features ?? []).includes(code)).length;
  }

  feature(code: string): string {
    return featureLabel(code);
  }

  money(value: number | string): string {
    return kes(value);
  }

  count(value: number): string {
    return new Intl.NumberFormat('en-KE').format(value);
  }

  /** Outcomes, until there are live numbers to show. */
  readonly facts = [
    { icon: 'bill', title: 'Bill a building at once', body: 'Every room’s rent and utilities in one run.' },
    { icon: 'lock', title: 'Rent lands in your PayBill', body: 'We never hold your money.' },
    { icon: 'mobile', title: 'Tenants see their own balance', body: 'Any time, on their phone.' },
    { icon: 'grid', title: 'Every building on one screen', body: 'Or one building at a time.' }
  ];

  readonly compare = [
    { icon: 'bill', topic: 'Sending bills', before: 'Working out each room in a notebook, then texting tenants one by one.', after: 'Bill the whole building at once — rent, utilities and readings — and every tenant sees their bill.' },
    { icon: 'cash', topic: 'Getting paid', before: 'Wrong account numbers, and M-Pesa messages matched to rooms by hand.', after: 'Tenants pay from an M-Pesa prompt. Each payment lands on the right room and month.' },
    { icon: 'message', topic: '“I already paid”', before: 'A screenshot on WhatsApp and an argument over which month.', after: 'The tenant pastes the M-Pesa message; you confirm it with one tap.' },
    { icon: 'call', topic: 'Late rent', before: 'Calling round the building, then calling again next week.', after: 'One list of who owes what. Tick the late ones and remind them all at once.' },
    { icon: 'wrench', topic: 'Repairs', before: 'A leak mentioned in passing, forgotten, raised again a month later.', after: 'Reported in the app, assigned to someone, flagged until it is fixed.' }
  ];

  /** Each step's screen cut down to the one figure that matters there. */
  readonly flow = [
    { title: 'Bill the month', body: 'Start the month for a building: rent, fixed charges and this month’s meter readings become each room’s bill. Waive or adjust any line, with a reason on record.',
      image: 'step-1-bill-the-month.png', screen: { label: 'November bills', big: '40 rooms', note: 'Ready to send', warn: false } },
    { title: 'Collect by M-Pesa', body: 'Connect your PayBill or till — for the agency or per building. Tenants pay from a prompt on their phone and the money goes straight to you.',
      image: 'step-2-collect-by-mpesa.png', screen: { label: 'Received today', big: 'KES 168,400', note: '14 M-Pesa payments', warn: false } },
    { title: 'Confirm and receipt', body: 'Payments are matched to the right room and month. Cash, bank and “I already paid” reports wait in one queue. Tenants download their receipt.',
      image: 'step-3-confirm-payments.png', screen: { label: 'Payments to confirm', big: '3', note: '2 match your records', warn: false } },
    { title: 'Follow up only with tenants who are behind', body: 'The overdue list shows who is behind, by how much and for how long. Tick the late ones, send one reminder, and watch the month close.',
      image: 'step-4-chase-overdue.png', screen: { label: 'Overdue', big: '4 tenants', note: 'KES 31,200 owed', warn: true } }
  ];

  readonly tenantGroups = [
    { icon: 'mobile', title: 'Pay', items: ['An M-Pesa prompt for all or part of the balance', 'Your PayBill details if they prefer', 'Report a payment by pasting the M-Pesa message'] },
    { icon: 'doc', title: 'Track', items: ['This month’s bill, itemised', 'Statements and receipts as PDFs', 'Their lease, deposit and documents'] },
    { icon: 'message', title: 'Talk', items: ['Report repairs and follow them to done', 'Message you in the app', 'Who to call for their building'] }
  ];

  /** The real inventory, from the product's screens; the first three of each are the ones that matter most. */
  readonly capabilities = [
    { icon: 'bill', title: 'Rent and billing', items: ['A monthly bill run per building', 'Fixed and metered utilities from meter readings', 'Balances carried forward', 'Adjustments and waivers, each with a reason', 'Late fees, automatic or waived'] },
    { icon: 'cash', title: 'Payments and M-Pesa', items: ['Your own PayBill or till, per agency or building', 'M-Pesa prompts to the tenant’s phone', 'Tenant-reported payments to confirm', 'Paste an M-Pesa or bank message to fill a payment', 'Receipts and statements as PDFs'] },
    { icon: 'list', title: 'Arrears and deposits', items: ['Overdue list with days late', 'Reminders to the tenants you tick', 'Deposits held, refunded or kept', 'Collection trends on your dashboard'] },
    { icon: 'doc', title: 'Tenants and leases', items: ['Room applications, reviewed and approved', 'Leases from your template, signed in the app', 'Tenant documents and verification', 'Lease changes with a full history', 'Move-in, move-out and past tenants of a room'] },
    { icon: 'building', title: 'Buildings and repairs', items: ['Buildings, floors and rooms with vacancy at a glance', 'Repairs with urgency, assignment and overdue flags', 'Contacts tenants can call', 'Each room’s repair and tenancy history'] },
    { icon: 'users', title: 'Team and messages', items: ['Staff limited to the buildings you give them', 'In-app chat with tenants', 'Notices by WhatsApp, SMS, email or in the app', 'A dashboard for the portfolio or one building'] }
  ];

  readonly roles = [
    { icon: 'home', title: 'You, the landlord', sees: 'every building, every shilling, every tenant.', not: 'nothing is hidden from you.' },
    { icon: 'key', title: 'Caretakers', sees: 'their building: tenants, readings, repairs.', not: 'other buildings, totals or your settings.' },
    { icon: 'chart', title: 'Office staff', sees: 'only the work you allow, in the buildings you give them.', not: 'anything you have not given them.' },
    { icon: 'user', title: 'Tenants', sees: 'their own bill, payments, lease and repairs.', not: 'anyone else’s records.' }
  ];

  readonly steps = [
    { title: 'Add your building', time: 'About 10 min', body: 'Name the floors and set the rent. Rooms and numbering are generated for you.' },
    { title: 'Connect your PayBill', time: 'About 10 min', body: 'Add your M-Pesa PayBill or till so tenants pay you directly.' },
    { title: 'Bring your tenants in', time: 'About 20 min', body: 'Record who lives where and send them their sign-in link.' },
    { title: 'Bill your first month', time: 'On the 1st', body: 'Send the month’s bills, let payments match themselves, and remind only the few who are behind.' }
  ];
}
