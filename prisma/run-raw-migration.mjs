import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(__dirname, 'raw-migrations.sql'), 'utf-8');

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:vick3900@localhost:5432/store_db',
});

try {
  await client.connect();
  console.log('Connected. Running raw migrations...');
  await client.query(sql);
  console.log('✓ Raw migrations applied successfully.');
} catch (err) {
  console.error('✗ Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
