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

const OUTLET_NAMES_KEY = "restaurant_outlet_names";

export function cacheOutletNames(outlets = []) {
  try {
    const map = Object.fromEntries(outlets.map((o) => [String(o.id), o.restaurantName || ""]));
    localStorage.setItem(OUTLET_NAMES_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable: outlet labels are simply omitted */
  }
}

export function getOutletNameById(outletId) {
  try {
    const map = JSON.parse(localStorage.getItem(OUTLET_NAMES_KEY) || "{}");
    return map[String(outletId)] || "";
  } catch {
    return "";
  }
}
