import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runSeeds(customPool = pool) {
  const client = await customPool.connect();
  try {
    console.log('🌱 Seeding database...');
    await client.query('BEGIN');

    const seedsDir = path.resolve(__dirname, '../../../../database/seeds');
    if (!fs.existsSync(seedsDir)) {
      throw new Error(`Seeds directory not found at ${seedsDir}`);
    }

    const files = fs.readdirSync(seedsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      console.log(`  Applying seed: ${file}`);
      const sql = fs.readFileSync(path.join(seedsDir, file), 'utf8');
      await client.query(sql);
    }

    await client.query('COMMIT');
    console.log('✅ Database seeded successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Allow direct execution: `tsx src/db/seed.ts`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSeeds()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
