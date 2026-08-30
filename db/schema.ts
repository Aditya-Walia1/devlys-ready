import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const businesses = sqliteTable(
  'businesses',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    ownerEmail: text('owner_email'),
    name: text('name').notNull(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('idx_businesses_owner_id').on(table.ownerId),
  ],
);

export const locations = sqliteTable(
  'locations',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    address: text('address').notNull(),
    googleReviewUrl: text('google_review_url').notNull(),
    brandColor: text('brand_color').notNull().default('#315efb'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('idx_locations_slug').on(table.slug),
    index('idx_locations_business_id').on(table.businessId),
  ],
);

export const reviewEvents = sqliteTable(
  'review_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    eventType: text('event_type').notNull(),
    rating: integer('rating'),
    topicsJson: text('topics_json'),
    draftEngine: text('draft_engine'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_review_events_location_created').on(
      table.locationId,
      table.createdAt,
    ),
    index('idx_review_events_session_created').on(
      table.sessionId,
      table.createdAt,
    ),
  ],
);
