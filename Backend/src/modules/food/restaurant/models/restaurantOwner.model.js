import mongoose from "mongoose";

const restaurantOwnerSchema = new mongoose.Schema(
  {
    ownerPhone: { type: String, trim: true },
    ownerPhoneLast10: { type: String, trim: true },
    ownerName: { type: String, trim: true },
    ownerEmail: { type: String, trim: true },

    // Owner-level KYC and payout, shared by every outlet under this owner.
    panNumber: { type: String, trim: true },
    nameOnPan: { type: String, trim: true },
    panImage: { type: String },
    accountHolderName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    ifscCode: { type: String, trim: true },
    bankName: { type: String, trim: true },
    accountType: { type: String, trim: true },
    upiId: { type: String, trim: true },
    upiQrImage: { type: String },
  },
  { collection: "food_restaurant_owners", timestamps: true },
);

restaurantOwnerSchema.index(
  { ownerPhoneLast10: 1 },
  {
    unique: true,
    partialFilterExpression: { ownerPhoneLast10: { $type: "string" } },
  },
);

export const RestaurantOwner = mongoose.model(
  "RestaurantOwner",
  restaurantOwnerSchema,
);
