export const isNonVegCategoryScope = (scope) =>
  String(scope || "").trim() === "Non-Veg"

export const isVegOnlyCategoryScope = (scope) =>
  String(scope || "").trim() === "Veg"

export const filterCategoriesForRestaurant = (categories, { pureVegRestaurant } = {}) => {
  const list = Array.isArray(categories) ? categories : []
  if (!pureVegRestaurant) return list
  return list.filter((category) => !isNonVegCategoryScope(category?.foodTypeScope))
}

export const canSelectNonVegFoodType = ({ pureVegRestaurant, categoryFoodTypeScope } = {}) => {
  if (pureVegRestaurant) return false
  if (isVegOnlyCategoryScope(categoryFoodTypeScope)) return false
  return true
}

/** "Both" food type needs the category to accept non-veg too, same gate as Non-Veg itself. */
export const canSelectBothFoodType = canSelectNonVegFoodType

export const categoryAcceptsFoodType = (scope, foodType) => {
  const normalizedScope = String(scope || "").trim()
  const normalizedFoodType = foodType === "Veg" || foodType === "Both" ? foodType : "Non-Veg"
  if (!normalizedScope) return true
  if (normalizedScope === "Both" || normalizedFoodType === "Both") return true
  return normalizedScope === normalizedFoodType
}
