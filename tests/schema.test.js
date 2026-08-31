import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const migrationsDirectory = new URL('../drizzle/', import.meta.url);
const migrations = readdirSync(migrationsDirectory)
  .filter((name) => /^\d+.*\.sql$/.test(name))
  .sort()
  .map((name) => readFileSync(new URL(name, migrationsDirectory), 'utf8'));

function createDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  migrations.forEach((migration) => {
    migration
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean)
      .forEach((statement) => database.exec(statement));
  });
  return database;
}

test('migrations create the commercial Smart Review tables and indexes', () => {
  const database = createDatabase();
  const objects = database.prepare(
    `SELECT name, type FROM sqlite_schema
     WHERE name NOT LIKE 'sqlite_%'
     ORDER BY name`,
  ).all();
  const names = new Set(objects.map((object) => object.name));
  for (const name of [
    'businesses',
    'business_members',
    'enrollment_applications',
    'locations',
    'payments',
    'review_events',
    'idx_businesses_owner_id',
    'idx_business_members_email',
    'idx_business_members_business_id',
    'idx_enrollment_applications_status_created',
    'idx_locations_slug',
    'idx_locations_business_id',
    'idx_payments_business_created',
    'idx_payments_status_created',
    'idx_review_events_location_created',
    'idx_review_events_session_created',
  ]) {
    assert.equal(names.has(name), true, `Missing schema object: ${name}`);
  }
  database.close();
});

test('analytics and commercial queue queries use their intended indexes', () => {
  const database = createDatabase();
  const analyticsPlan = database.prepare(
    `EXPLAIN QUERY PLAN
     SELECT * FROM review_events
     WHERE location_id = ? AND created_at >= datetime('now', '-30 days')`,
  ).all('location-1');
  assert.match(
    analyticsPlan.map((row) => row.detail).join(' '),
    /idx_review_events_location_created/,
  );
  const paymentPlan = database.prepare(
    `EXPLAIN QUERY PLAN
     SELECT * FROM payments WHERE status = ? ORDER BY created_at DESC`,
  ).all('submitted');
  assert.match(paymentPlan.map((row) => row.detail).join(' '), /idx_payments_status_created/);
  database.close();
});
