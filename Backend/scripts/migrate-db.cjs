// Non-destructive migration: copies every collection from SOURCE db to TARGET db.
// - Only inserts documents whose _id is missing in target ($setOnInsert). Never updates/deletes.
// - Never drops collections/databases. Other DBs on target cluster are untouched.
// Usage: SRC_URI=... SRC_DB=craviooo DST_URI=... DST_DB=cravioo node scripts/migrate-db.cjs [--dry-run]
const { MongoClient } = require('mongodb');

const { SRC_URI, SRC_DB, DST_URI, DST_DB } = process.env;
const dryRun = process.argv.includes('--dry-run');
const BATCH = 500;

(async () => {
  if (!SRC_URI || !SRC_DB || !DST_URI || !DST_DB) throw new Error('Set SRC_URI, SRC_DB, DST_URI, DST_DB');
  const src = await MongoClient.connect(SRC_URI);
  const dst = await MongoClient.connect(DST_URI);
  const sdb = src.db(SRC_DB);
  const ddb = dst.db(DST_DB);

  const cols = (await sdb.listCollections({ type: 'collection' }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.'));

  console.log(`${dryRun ? '[DRY RUN] ' : ''}Source ${SRC_DB} -> Target ${DST_DB}, ${cols.length} collections`);

  for (const name of cols) {
    const s = sdb.collection(name);
    const d = ddb.collection(name);
    const total = await s.countDocuments();
    let inserted = 0;
    let skipped = 0;

    if (!dryRun) {
      let ops = [];
      const flush = async () => {
        if (!ops.length) return;
        const r = await d.bulkWrite(ops, { ordered: false });
        inserted += r.upsertedCount;
        skipped += ops.length - r.upsertedCount;
        ops = [];
      };
      for await (const doc of s.find({})) {
        ops.push({ updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true } });
        if (ops.length >= BATCH) await flush();
      }
      await flush();

      // copy indexes that don't already exist (skip default _id index)
      for (const idx of await s.indexes()) {
        if (idx.name === '_id_') continue;
        const { key, v, ns, ...opts } = idx;
        try { await d.createIndex(key, opts); }
        catch (e) { console.log(`  index ${name}.${idx.name} skipped: ${e.message}`); }
      }
    }
    const dstCount = await d.countDocuments();
    console.log(`${name}: source=${total} inserted=${inserted} alreadyPresent=${skipped} targetNow=${dstCount}`);
  }

  await src.close();
  await dst.close();
})().catch((e) => { console.error(e); process.exit(1); });
