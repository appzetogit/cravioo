export const RESTAURANT_ORDERS_SCOPE_KEY = "restaurant_orders_scope";

export function getRestaurantOrdersScope() {
  try {
    return localStorage.getItem(RESTAURANT_ORDERS_SCOPE_KEY) === "all" ? "all" : "outlet";
  } catch {
    return "outlet";
  }
}

export function setRestaurantOrdersScope(scope) {
  try {
    localStorage.setItem(RESTAURANT_ORDERS_SCOPE_KEY, scope === "all" ? "all" : "outlet");
  } catch {
    /* storage unavailable: fall back to per-outlet view */
  }
}
