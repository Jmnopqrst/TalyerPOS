import type { CartItem } from "../../../types/global";

export function calculateCartTotals(cart: CartItem[], discount = 0) {
  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return {
    subtotal,
    discount: Math.max(0, discount),
    total: Math.max(0, subtotal - Math.max(0, discount))
  };
}
