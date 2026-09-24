/**
 * Database Migration & Seeding CLI script
 * 
 * Usage:
 *   node src/db/migrate.js --schema    (Runs schema.sql)
 *   node src/db/migrate.js --seed      (Runs seed.sql)
 *   node src/db/migrate.js --setup     (Runs both schema.sql and seed.sql)
 */
const { runMigrations } = require('./index');

async function main() {
  const args = process.argv.slice(2);
  const runSchema = args.includes('--schema') || args.includes('--setup') || args.length === 0;
  const runSeed = args.includes('--seed') || args.includes('--setup') || args.length === 0;

  try {
    console.log('--- Database Setup Starting ---');
    await runMigrations({ schema: runSchema, seed: runSeed });
    console.log('--- Database Setup Finished Successfully ---');
    process.exit(0);
  } catch (err) {
    console.error(' Database setup error:', err);
    process.exit(1);
  }
}

main();
