// No fallback image — an item/restaurant with no uploaded photo shows an empty
// section instead of a placeholder from a third-party random-image service.
export const FOOD_IMAGE_FALLBACK = "";
export const RUPEE_SYMBOL = "\u20B9";

const toImageUrl = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object" && value.url) return String(value.url).trim();
  return "";
};

export const buildRestaurantGallery = (restaurant) => {
  if (!restaurant) return [];

  const covers = (Array.isArray(restaurant.coverImages) ? restaurant.coverImages : [])
    .map(toImageUrl)
    .filter(Boolean);
  const banners = (Array.isArray(restaurant.banners) ? restaurant.banners : [])
    .map(toImageUrl)
    .filter(Boolean);
  const menus = (Array.isArray(restaurant.menuImages) ? restaurant.menuImages : [])
    .map(toImageUrl)
    .filter(Boolean);
  const profile = toImageUrl(restaurant.profileImage);
  const primary = toImageUrl(restaurant.image);

  const combined = [...covers, ...banners, ...menus, profile, primary].filter(Boolean);
  return combined.filter((url, index) => combined.indexOf(url) === index);
};
