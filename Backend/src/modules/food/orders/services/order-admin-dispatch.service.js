import mongoose from "mongoose";
import { FoodOrder } from "../models/order.model.js";
import { FoodRestaurant } from "../../restaurant/models/restaurant.model.js";
import { FoodDeliveryPartner } from "../../delivery/models/deliveryPartner.model.js";
import { NotFoundError, ValidationError } from "../../../../core/auth/errors.js";
import { haversineKm, buildOrderIdentityFilter } from "./order.helpers.js";

const ACTIVE_ORDER_STATUSES = ["confirmed", "preparing", "ready_for_pickup", "picked_up"];
const STALE_GPS_MS = 10 * 60 * 1000;

function restaurantLatLng(restaurant) {
  const c = restaurant?.location?.coordinates;
  if (Array.isArray(c) && c.length >= 2 && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1]))) {
    return { lat: Number(c[1]), lng: Number(c[0]) };
  }
  const lat = Number(restaurant?.location?.latitude);
  const lng = Number(restaurant?.location?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/**
 * Online riders for the admin "assign driver" dialog, nearest to the order's restaurant first.
 * Straight-line distance only (no Maps API calls).
 */
export async function listAssignableDriversForOrder(orderId) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");
  const order = await FoodOrder.findOne(identity)
    .select("orderId orderStatus restaurantId dispatch deliveryState")
    .lean();
  if (!order) throw new NotFoundError("Order not found");

  const restaurant = await FoodRestaurant.findById(order.restaurantId)
    .select("restaurantName location")
    .lean();
  const origin = restaurantLatLng(restaurant);

  const allowedStatuses =
    process.env.NODE_ENV === "production" ? ["approved"] : ["approved", "pending"];
  const partners = await FoodDeliveryPartner.find({
    availabilityStatus: "online",
    status: { $in: allowedStatuses },
    isActive: { $ne: false },
  })
    .select("name phone vehicleType vehicleNumber lastLat lastLng lastLocationAt maxConcurrentOrders")
    .lean();

  const ids = partners.map((p) => p._id);
  const activeCounts = ids.length
    ? await FoodOrder.aggregate([
        {
          $match: {
            "dispatch.deliveryPartnerId": { $in: ids },
            "dispatch.status": "accepted",
            orderStatus: { $in: ACTIVE_ORDER_STATUSES },
          },
        },
        { $group: { _id: "$dispatch.deliveryPartnerId", count: { $sum: 1 } } },
      ])
    : [];
  const countById = new Map(activeCounts.map((r) => [String(r._id), r.count]));
  const currentId = order.dispatch?.deliveryPartnerId ? String(order.dispatch.deliveryPartnerId) : null;

  const drivers = partners.map((p) => {
    const hasLoc = Number.isFinite(p.lastLat) && Number.isFinite(p.lastLng);
    const distanceKm =
      origin && hasLoc ? Math.round(haversineKm(origin.lat, origin.lng, p.lastLat, p.lastLng) * 10) / 10 : null;
    return {
      id: String(p._id),
      name: p.name || "Delivery Partner",
      phone: p.phone || "",
      vehicleType: p.vehicleType || "",
      vehicleNumber: p.vehicleNumber || "",
      lat: hasLoc ? p.lastLat : null,
      lng: hasLoc ? p.lastLng : null,
      distanceKm,
      lastLocationAt: p.lastLocationAt || null,
      isStale: !p.lastLocationAt || Date.now() - new Date(p.lastLocationAt).getTime() > STALE_GPS_MS,
      activeOrders: countById.get(String(p._id)) || 0,
      maxConcurrentOrders: p.maxConcurrentOrders || 1,
      isCurrent: currentId === String(p._id),
    };
  });

  drivers.sort((a, b) => {
    if (a.distanceKm == null && b.distanceKm == null) return 0;
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  const phase = order.deliveryState?.currentPhase || "waiting_activation";
  return {
    order: {
      id: String(order._id),
      orderId: order.orderId,
      orderStatus: order.orderStatus,
      dispatchStatus: order.dispatch?.status || "unassigned",
      currentDriverId: currentId,
      canAssign:
        ["confirmed", "preparing", "ready_for_pickup"].includes(order.orderStatus) &&
        ["waiting_activation", "en_route_to_pickup"].includes(phase),
    },
    restaurant: {
      name: restaurant?.restaurantName || "",
      lat: origin?.lat ?? null,
      lng: origin?.lng ?? null,
    },
    drivers,
  };
}

/** Accepted, in-progress orders (optionally one zone) for the admin live-tracking map. */
export async function listLiveTrackingOrders({ zoneId } = {}) {
  const filter = {
    "dispatch.status": "accepted",
    orderStatus: { $in: ACTIVE_ORDER_STATUSES },
  };
  if (zoneId) {
    if (!mongoose.Types.ObjectId.isValid(zoneId)) throw new ValidationError("Invalid zone id");
    filter.zoneId = new mongoose.Types.ObjectId(zoneId);
  }
  const docs = await FoodOrder.find(filter)
    .select("orderId orderStatus zoneId restaurantId userId dispatch deliveryState deliveryAddress lastRiderLocation")
    .populate("restaurantId", "restaurantName location")
    .populate("userId", "name phone")
    .populate("dispatch.deliveryPartnerId", "name phone lastLat lastLng")
    .sort({ updatedAt: -1 })
    .limit(300)
    .lean();

  return docs.map((o) => {
    const rest = restaurantLatLng(o.restaurantId);
    const dc = o.deliveryAddress?.location?.coordinates;
    const customer =
      Array.isArray(dc) && dc.length >= 2 ? { lat: Number(dc[1]), lng: Number(dc[0]) } : null;
    const driver = o.dispatch?.deliveryPartnerId;
    const rl = o.lastRiderLocation?.coordinates;
    const driverLoc =
      Array.isArray(rl) && rl.length >= 2
        ? { lat: Number(rl[1]), lng: Number(rl[0]) }
        : Number.isFinite(driver?.lastLat)
          ? { lat: driver.lastLat, lng: driver.lastLng }
          : null;
    return {
      id: String(o._id),
      orderId: o.orderId,
      orderStatus: o.orderStatus,
      phase: o.deliveryState?.currentPhase || "",
      zoneId: o.zoneId ? String(o.zoneId) : null,
      restaurant: rest ? { name: o.restaurantId?.restaurantName || "", ...rest } : null,
      customer: customer ? { name: o.userId?.name || "Customer", phone: o.userId?.phone || "", ...customer } : null,
      driver: driver
        ? { id: String(driver._id), name: driver.name || "Driver", phone: driver.phone || "", location: driverLoc }
        : null,
    };
  });
}
