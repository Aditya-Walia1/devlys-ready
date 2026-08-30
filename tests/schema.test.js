import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const migration = readFileSync(
  new URL('../drizzle/0000_chief_princess_powerful.sql', import.meta.url),
  'utf8',
);

function createDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  migration
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .forEach((statement) => database.exec(statement));
  return database;
}

test('migration creates the Smart Review tables and indexes', () => {
  const database = createDatabase();
  const objects = database.prepare(
    `SELECT name, type FROM sqlite_schema
     WHERE name NOT LIKE 'sqlite_%'
     ORDER BY name`,
  ).all();
  const names = new Set(objects.map((object) => object.name));
  for (const name of [
    'businesses',
    'locations',
    'review_events',
    'idx_businesses_owner_id',
    'idx_locations_slug',
    'idx_locations_business_id',
    'idx_review_events_location_created',
    'idx_review_events_session_created',
  ]) {
    assert.equal(names.has(name), true, `Missing schema object: ${name}`);
  }
  database.close();
});

test('location analytics query uses the intended composite index', () => {
  const database = createDatabase();
  const plan = database.prepare(
    `EXPLAIN QUERY PLAN
     SELECT * FROM review_events
     WHERE location_id = ? AND created_at >= datetime('now', '-30 days')`,
  ).all('location-1');
  assert.match(plan.map((row) => row.detail).join(' '), /idx_review_events_location_created/);
  database.close();
});
