import { Injectable, computed, signal } from '@angular/core';
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
  private readonly itemsState = signal<CartItem[]>(this.restore());

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
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Private/restricted browsing contexts throw — the in-memory cart is still cleared.
    }
  }

  private sameLine(a: Pick<CartItem, 'productId' | 'variantId'>, b: Pick<CartItem, 'productId' | 'variantId'>): boolean {
    return a.productId === b.productId && (a.variantId ?? null) === (b.variantId ?? null);
  }

  private persist(items: CartItem[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage may be unavailable; the cart still works for this session.
    }
  }

  private restore(): CartItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
    } catch {
      return [];
    }
  }
}
