import mongoose from "mongoose";
import { FoodRestaurant } from "../models/restaurant.model.js";
import { RestaurantOwner } from "../models/restaurantOwner.model.js";
import { issueRestaurantSession } from "../../../../core/auth/auth.service.js";
import { signRestaurantRegistrationToken } from "../../../../core/auth/token.util.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../../../../core/auth/errors.js";

const OWNER_FIELDS = [
  "ownerName",
  "ownerEmail",
  "panNumber",
  "nameOnPan",
  "panImage",
  "accountHolderName",
  "accountNumber",
  "ifscCode",
  "accountType",
  "upiId",
  "upiQrImage",
];

const pickOwnerFields = (source) =>
  Object.fromEntries(
    OWNER_FIELDS.filter((f) => source[f] != null && source[f] !== "").map((f) => [f, source[f]]),
  );

/** Returns the owner id for an outlet, creating the owner record lazily for legacy outlets. */
export const ensureOwnerForOutlet = async (outlet) => {
  if (outlet.ownerId) return String(outlet.ownerId);
  const last10 = outlet.ownerPhoneLast10;
  if (!last10) throw new ValidationError("Outlet has no owner phone; contact support");

  let owner = await RestaurantOwner.findOne({ ownerPhoneLast10: last10 }).lean();
  if (!owner) {
    owner = (
      await RestaurantOwner.create({
        ownerPhone: outlet.ownerPhone,
        ownerPhoneLast10: last10,
        ...pickOwnerFields(outlet),
      })
    ).toObject();
  }

  await FoodRestaurant.updateOne({ _id: outlet._id, ownerId: null }, { $set: { ownerId: owner._id } });
  return String(owner._id);
};

const loadCurrentOutlet = async (userId) => {
  const outlet = await FoodRestaurant.findById(userId);
  if (!outlet) throw new NotFoundError("Restaurant not found");
  return outlet;
};

export const listOwnerOutlets = async (user) => {
  const current = await loadCurrentOutlet(user.userId);
  const ownerId = await ensureOwnerForOutlet(current);
  const outlets = await FoodRestaurant.find({
    ownerId: new mongoose.Types.ObjectId(ownerId),
    isDeleted: { $ne: true },
  })
    .select("restaurantName status isActive addressLine1 area city ownerId createdAt")
    .sort({ createdAt: 1 })
    .lean();

  return {
    ownerId,
    activeOutletId: String(current._id),
    outlets: outlets.map((o) => ({
      id: String(o._id),
      restaurantName: o.restaurantName,
      status: o.status,
      isActive: o.isActive !== false,
      area: o.area || "",
      city: o.city || "",
    })),
  };
};

export const getOwnerOutletIds = async (ownerId) => {
  if (!ownerId) return [];
  const rows = await FoodRestaurant.find({
    ownerId: new mongoose.Types.ObjectId(String(ownerId)),
    isDeleted: { $ne: true },
  })
    .select("_id")
    .lean();
  return rows.map((r) => String(r._id));
};

/** Issues a session scoped to another outlet owned by the same owner account. */
export const switchOutlet = async (user, targetOutletId) => {
  if (!mongoose.Types.ObjectId.isValid(String(targetOutletId || ""))) {
    throw new ValidationError("Invalid outlet id");
  }
  const current = await loadCurrentOutlet(user.userId);
  const ownerId = await ensureOwnerForOutlet(current);

  const target = await FoodRestaurant.findOne({
    _id: targetOutletId,
    ownerId: new mongoose.Types.ObjectId(ownerId),
  });
  if (!target) throw new ForbiddenError("This outlet does not belong to your account");
  if (target.isDeleted === true || target.accountStatus === "deleted") {
    throw new ForbiddenError("This outlet has been deleted");
  }

  return issueRestaurantSession(target);
};

/** Creates a new outlet under the caller's owner and returns a registration token scoped to it. */
export const addOutlet = async (user, { restaurantName }) => {
  const name = String(restaurantName || "").trim();
  if (!name) throw new ValidationError("Outlet name is required");

  const current = await loadCurrentOutlet(user.userId);
  const ownerId = await ensureOwnerForOutlet(current);
  const owner = await RestaurantOwner.findById(ownerId).lean();

  let outlet;
  try {
    outlet = await FoodRestaurant.create({
      restaurantName: name,
      ownerId: owner._id,
      ownerPhone: owner.ownerPhone,
      primaryContactNumber: owner.ownerPhone,
      ownerName: owner.ownerName || current.ownerName,
      ownerEmail: owner.ownerEmail || current.ownerEmail,
      ...pickOwnerFields(owner),
      status: "onboarding",
      onboardingStep: 2,
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw new ValidationError("An outlet with this name already exists on your account");
    }
    throw err;
  }

  return {
    outlet: { id: String(outlet._id), restaurantName: outlet.restaurantName, status: outlet.status },
    registrationToken: signRestaurantRegistrationToken(owner.ownerPhone, {
      outletId: outlet._id,
      ownerId,
    }),
  };
};

/** Admin view: one owner account with every outlet under it. */
export const getOwnerWithOutlets = async (ownerId) => {
  if (!mongoose.Types.ObjectId.isValid(String(ownerId || ""))) {
    throw new ValidationError("Invalid owner id");
  }
  const owner = await RestaurantOwner.findById(ownerId).lean();
  if (!owner) throw new NotFoundError("Owner not found");
  const outlets = await FoodRestaurant.find({ ownerId: owner._id, isDeleted: { $ne: true } })
    .select("restaurantName status isActive area city commissionPercentage createdAt")
    .sort({ createdAt: 1 })
    .lean();
  return {
    owner: {
      id: String(owner._id),
      ownerName: owner.ownerName || "",
      ownerPhone: owner.ownerPhone || "",
      ownerEmail: owner.ownerEmail || "",
      accountHolderName: owner.accountHolderName || "",
      accountNumber: owner.accountNumber ? `XXXX${String(owner.accountNumber).slice(-4)}` : "",
      ifscCode: owner.ifscCode || "",
    },
    outlets: outlets.map((o) => ({
      id: String(o._id),
      restaurantName: o.restaurantName,
      status: o.status,
      isActive: o.isActive !== false,
      area: o.area || "",
      city: o.city || "",
      commissionPercentage: o.commissionPercentage ?? null,
    })),
  };
};
