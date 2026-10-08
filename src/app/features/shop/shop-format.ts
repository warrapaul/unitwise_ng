/** Shop money, the way a shopper reads it: "KES 1,250", no decimals unless there are cents. */
export function ksh(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) {
    return 'KES -';
  }
  return `KES ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** The order states a shopper sees, in their words rather than the warehouse's. */
const ORDER_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  WAITING_PAYMENT_CONFIRMATION: { label: 'Awaiting payment', tone: 'warning' },
  WAITING_PAYMENT_COMPLETION: { label: 'Part paid', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'info' },
  PROCESSING: { label: 'Being prepared', tone: 'info' },
  READY_FOR_PICKUP: { label: 'Ready for pickup', tone: 'info' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', tone: 'info' },
  DELIVERED: { label: 'Delivered', tone: 'success' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
  PAYMENT_FAILED: { label: 'Payment failed', tone: 'danger' },
  PAYMENT_TIMEOUT: { label: 'Payment timed out', tone: 'danger' }
};

export function orderStatus(status: string | null | undefined): { label: string; tone: string } {
  if (!status) {
    return { label: '-', tone: 'neutral' };
  }
  return ORDER_STATUS[status] ?? { label: status.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()), tone: 'neutral' };
}
