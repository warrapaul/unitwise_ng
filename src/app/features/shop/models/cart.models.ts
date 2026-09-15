export interface CartItem {
  productId: number;
  variantId?: number | null;
  name: string;
  variantLabel?: string | null;
  image?: string | null;
  unitPrice: number;
  quantity: number;
  /** Stock ceiling captured at add-time; the server re-validates before checkout. */
  maxQuantity: number;
}
