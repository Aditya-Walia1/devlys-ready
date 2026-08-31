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
    contactName: text('contact_name'),
    contactPhone: text('contact_phone'),
    status: text('status').notNull().default('pending_payment'),
    planCode: text('plan_code').notNull().default('growth'),
    billingCycleMonths: integer('billing_cycle_months').notNull().default(6),
    pricePaise: integer('price_paise').notNull().default(0),
    paymentStatus: text('payment_status').notNull().default('unpaid'),
    paymentLinkUrl: text('payment_link_url'),
    serviceStartsAt: text('service_starts_at'),
    serviceEndsAt: text('service_ends_at'),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('idx_businesses_owner_id').on(table.ownerId),
  ],
);

export const businessMembers = sqliteTable(
  'business_members',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    userId: text('user_id'),
    role: text('role').notNull().default('client_owner'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('idx_business_members_email').on(table.email),
    uniqueIndex('idx_business_members_user_id').on(table.userId),
    index('idx_business_members_business_id').on(table.businessId),
  ],
);

export const enrollmentApplications = sqliteTable(
  'enrollment_applications',
  {
    id: text('id').primaryKey(),
    businessName: text('business_name').notNull(),
    contactName: text('contact_name').notNull(),
    contactEmail: text('contact_email').notNull(),
    contactPhone: text('contact_phone').notNull(),
    locationName: text('location_name').notNull(),
    address: text('address').notNull(),
    googleReviewUrl: text('google_review_url').notNull(),
    planCode: text('plan_code').notNull().default('growth'),
    status: text('status').notNull().default('submitted'),
    businessId: text('business_id').references(() => businesses.id, { onDelete: 'set null' }),
    reviewedBy: text('reviewed_by'),
    reviewedAt: text('reviewed_at'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_enrollment_applications_status_created').on(table.status, table.createdAt),
    index('idx_enrollment_applications_contact_email').on(table.contactEmail),
  ],
);

export const payments = sqliteTable(
  'payments',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    amountPaise: integer('amount_paise').notNull(),
    method: text('method').notNull().default('bank_transfer'),
    reference: text('reference'),
    status: text('status').notNull().default('submitted'),
    submittedBy: text('submitted_by'),
    verifiedBy: text('verified_by'),
    paidAt: text('paid_at'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_payments_business_created').on(table.businessId, table.createdAt),
    index('idx_payments_status_created').on(table.status, table.createdAt),
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
