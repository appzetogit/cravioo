// Links every existing restaurant to a RestaurantOwner (keyed by owner phone).
// Additive and idempotent: restaurant documents keep all their current fields, so
// existing login and onboarding flows are unaffected. Dry-run unless --apply is passed.
//   node scripts/migrate-restaurant-owners.js          # report only
//   node scripts/migrate-restaurant-owners.js --apply  # write owners + ownerId

import { connectDB, disconnectDB } from "../src/config/db.js";
import { FoodRestaurant } from "../src/modules/food/restaurant/models/restaurant.model.js";
import { RestaurantOwner } from "../src/modules/food/restaurant/models/restaurantOwner.model.js";

const apply = process.argv.includes("--apply");

const OWNER_FIELDS = [
  "ownerPhone",
  "ownerPhoneLast10",
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

const pickOwnerFields = (restaurant) =>
  Object.fromEntries(
    OWNER_FIELDS.filter((f) => restaurant[f] != null && restaurant[f] !== "").map((f) => [f, restaurant[f]]),
  );

const run = async () => {
  await connectDB();

  try {
    const pending = await FoodRestaurant.find({
      $or: [{ ownerId: null }, { ownerId: { $exists: false } }],
    }).lean();

    const skipped = pending.filter((r) => !r.ownerPhoneLast10);
    const linkable = pending.filter((r) => r.ownerPhoneLast10);

    console.log(`Restaurants without owner: ${pending.length}`);
    console.log(`  linkable (have owner phone): ${linkable.length}`);
    console.log(`  skipped (no owner phone, fix manually): ${skipped.length}`);
    skipped.forEach((r) => console.log(`    - ${r._id} ${r.restaurantName || ""}`));

    const byPhone = new Map();
    for (const r of linkable) {
      if (!byPhone.has(r.ownerPhoneLast10)) byPhone.set(r.ownerPhoneLast10, []);
      byPhone.get(r.ownerPhoneLast10).push(r);
    }
    console.log(`Distinct owners to create/link: ${byPhone.size}`);

    if (!apply) {
      console.log("Dry run. Re-run with --apply to write changes.");
      return;
    }

    // autoIndex is off in production, so the owner phone unique index must be built explicitly.
    await RestaurantOwner.createIndexes();

    let ownersCreated = 0;
    let restaurantsLinked = 0;

    for (const [phoneLast10, outlets] of byPhone) {
      let owner = await RestaurantOwner.findOne({ ownerPhoneLast10: phoneLast10 }).lean();
      if (!owner) {
        const created = await RestaurantOwner.create(pickOwnerFields(outlets[0]));
        owner = created.toObject();
        ownersCreated += 1;
      }

      const result = await FoodRestaurant.updateMany(
        { _id: { $in: outlets.map((o) => o._id) }, $or: [{ ownerId: null }, { ownerId: { $exists: false } }] },
        { $set: { ownerId: owner._id } },
      );
      restaurantsLinked += result.modifiedCount;
    }

    console.log(`Owners created: ${ownersCreated}`);
    console.log(`Restaurants linked: ${restaurantsLinked}`);
  } finally {
    await disconnectDB();
  }
};

run().catch((err) => {
  console.error("Owner migration failed:", err);
  process.exitCode = 1;
});
