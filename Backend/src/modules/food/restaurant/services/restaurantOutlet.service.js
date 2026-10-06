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
/**
 * Creates one onboarding outlet per name under the caller's owner, in a single request.
 * Every outlet is its own restaurant record and goes to admin separately once submitted.
 */
export const createAdditionalOutlets = async (user, rawNames) => {
  const names = [
    ...new Set((Array.isArray(rawNames) ? rawNames : [rawNames]).map((n) => String(n || "").trim()).filter(Boolean)),
  ];
  if (!names.length) throw new ValidationError("At least one outlet name is required");
  if (names.length > 20) throw new ValidationError("You can add up to 20 outlets at once");

  const current = await loadCurrentOutlet(user.userId);
  const ownerId = await ensureOwnerForOutlet(current);
  const owner = await RestaurantOwner.findById(ownerId).lean();

  const created = [];
  const failed = [];
  for (const name of names) {
    try {
      const outlet = await FoodRestaurant.create({
        restaurantName: name,
        ownerId: owner._id,
        ownerPhone: owner.ownerPhone,
        primaryContactNumber: owner.ownerPhone,
        ownerName: owner.ownerName || current.ownerName,
        ownerEmail: owner.ownerEmail || current.ownerEmail,
        ...pickOwnerFields(owner),
        zoneId: current.zoneId || undefined,
        isAdditionalOutlet: true,
        status: "onboarding",
        onboardingStep: 1,
      });
      created.push({ id: String(outlet._id), restaurantName: outlet.restaurantName, status: outlet.status });
    } catch (err) {
      const message =
        err?.code === 11000 && err?.keyPattern?.restaurantNameNormalized
          ? "An outlet with this name already exists on your account"
          : "Could not create this outlet";
      failed.push({ name, message });
    }
  }
  return { created, failed };
};

/** Fresh onboarding token for one of the caller's outlets that is still being onboarded. */
export const issueOutletOnboardingToken = async (user, outletId) => {
  if (!mongoose.Types.ObjectId.isValid(String(outletId || ""))) {
    throw new ValidationError("Invalid outlet id");
  }
  const current = await loadCurrentOutlet(user.userId);
  const ownerId = await ensureOwnerForOutlet(current);
  const outlet = await FoodRestaurant.findOne({
    _id: outletId,
    ownerId: new mongoose.Types.ObjectId(ownerId),
  }).lean();
  if (!outlet) throw new ForbiddenError("This outlet does not belong to your account");
  if (outlet.status !== "onboarding") {
    throw new ValidationError("This outlet is no longer in onboarding");
  }
  const owner = await RestaurantOwner.findById(ownerId).lean();
  return {
    outletId: String(outlet._id),
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

const OWNER_TEXT_FIELDS = [
  "ownerName",
  "ownerEmail",
  "ownerPhone",
  "panNumber",
  "nameOnPan",
  "accountHolderName",
  "accountNumber",
  "ifscCode",
  "accountType",
  "upiId",
];

/**
 * Additional outlets never re-enter owner-level details or zone: those come from the
 * owner account and the outlet's own zone, whatever the client sent.
 */
export const prefillAdditionalOutletBody = async (body = {}, { outletId, ownerId } = {}) => {
  if (!outletId || !ownerId || !mongoose.Types.ObjectId.isValid(String(outletId))) return body;
  const outlet = await FoodRestaurant.findById(outletId).select("isAdditionalOutlet zoneId ownerId").lean();
  if (!outlet?.isAdditionalOutlet || String(outlet.ownerId) !== String(ownerId)) return body;

  const owner = (await RestaurantOwner.findById(ownerId).lean()) || {};
  const sibling =
    (await FoodRestaurant.findOne({
      ownerId: outlet.ownerId,
      isAdditionalOutlet: { $ne: true },
      isDeleted: { $ne: true },
    })
      .sort({ createdAt: 1 })
      .lean()) || {};

  const next = { ...body };
  for (const field of OWNER_TEXT_FIELDS) {
    const value = owner[field] || sibling[field];
    if (value) next[field] = String(value);
  }
  if (outlet.zoneId) next.zoneId = String(outlet.zoneId);
  return next;
};
