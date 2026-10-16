import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthSessionService } from '../../core/services/auth-session.service';
import { CartItem } from './models/cart.models';

const STORAGE_KEY = 'cart_items';

/**
 * The one sanctioned use of localStorage in this app (skills §3/§12): cart items
 * only, never tokens or session data. Prices here are a convenience for the
 * summary — the server re-prices and re-checks stock via
 * `POST /v1/orders/validate-cart` before an order is placed.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly session = inject(AuthSessionService);
  /** Whose cart is loaded: carts are kept per account, so another account never sees this one. */
  private owner: number | null = this.session.currentUserId() ?? null;
  private readonly itemsState = signal<CartItem[]>(this.restore());

  constructor() {
    // Signing out empties the cart on this device; signing in as someone loads their own.
    effect(() => {
      const user = this.session.currentUserId() ?? null;
      untracked(() => {
        if (user === this.owner) return;
        if (user === null) {
          this.clear();
        }
        this.owner = user;
        this.itemsState.set(this.restore());
      });
    });
  }

  readonly items = this.itemsState.asReadonly();
  readonly itemCount = computed(() => this.itemsState().reduce((total, item) => total + item.quantity, 0));
  readonly subtotal = computed(() => this.itemsState().reduce((total, item) => total + item.unitPrice * item.quantity, 0));
  readonly isEmpty = computed(() => this.itemsState().length === 0);

  addItem(item: CartItem): void {
    this.itemsState.update((items) => {
      const index = items.findIndex((existing) => this.sameLine(existing, item));
      const updated = index >= 0
        ? items.map((existing, position) => position === index
          ? { ...existing, quantity: Math.min(existing.quantity + item.quantity, existing.maxQuantity || Number.MAX_SAFE_INTEGER) }
          : existing)
        : [...items, item];

      this.persist(updated);
      return updated;
    });
  }

  updateQuantity(productId: number, variantId: number | null | undefined, quantity: number): void {
    if (quantity <= 0) {
      this.removeItem(productId, variantId);
      return;
    }

    this.itemsState.update((items) => {
      const updated = items.map((item) => this.sameLine(item, { productId, variantId })
        ? { ...item, quantity: Math.min(quantity, item.maxQuantity || Number.MAX_SAFE_INTEGER) }
        : item);

      this.persist(updated);
      return updated;
    });
  }

  removeItem(productId: number, variantId?: number | null): void {
    this.itemsState.update((items) => {
      const updated = items.filter((item) => !this.sameLine(item, { productId, variantId }));
      this.persist(updated);
      return updated;
    });
  }

  clear(): void {
    this.itemsState.set([]);

    try {
      localStorage.removeItem(this.key());
      localStorage.removeItem(STORAGE_KEY); // the shared key older builds used
    } catch {
      // Private/restricted browsing contexts throw — the in-memory cart is still cleared.
    }
  }

  private key(): string {
    return `${STORAGE_KEY}_${this.owner ?? 'anonymous'}`;
  }

  private sameLine(a: Pick<CartItem, 'productId' | 'variantId'>, b: Pick<CartItem, 'productId' | 'variantId'>): boolean {
    return a.productId === b.productId && (a.variantId ?? null) === (b.variantId ?? null);
  }

  private persist(items: CartItem[]): void {
    try {
      localStorage.setItem(this.key(), JSON.stringify(items));
    } catch {
      // Storage may be unavailable; the cart still works for this session.
    }
  }

  private restore(): CartItem[] {
    try {
      if (this.owner === null) {
        return []; // Nobody signed in: nothing to show.
      }
      const raw = localStorage.getItem(this.key());
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
    } catch {
      return [];
    }
  }
}
