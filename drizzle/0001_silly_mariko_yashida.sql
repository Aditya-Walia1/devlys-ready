CREATE TABLE `business_members` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`email` text NOT NULL,
	`user_id` text,
	`role` text DEFAULT 'client_owner' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_business_members_email` ON `business_members` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_business_members_user_id` ON `business_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_business_members_business_id` ON `business_members` (`business_id`);--> statement-breakpoint
CREATE TABLE `enrollment_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`business_name` text NOT NULL,
	`contact_name` text NOT NULL,
	`contact_email` text NOT NULL,
	`contact_phone` text NOT NULL,
	`location_name` text NOT NULL,
	`address` text NOT NULL,
	`google_review_url` text NOT NULL,
	`plan_code` text DEFAULT 'growth' NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`business_id` text,
	`reviewed_by` text,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_enrollment_applications_status_created` ON `enrollment_applications` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_enrollment_applications_contact_email` ON `enrollment_applications` (`contact_email`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`method` text DEFAULT 'bank_transfer' NOT NULL,
	`reference` text,
	`status` text DEFAULT 'submitted' NOT NULL,
	`submitted_by` text,
	`verified_by` text,
	`paid_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_payments_business_created` ON `payments` (`business_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_payments_status_created` ON `payments` (`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `businesses` ADD `contact_name` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `contact_phone` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `status` text DEFAULT 'pending_payment' NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `plan_code` text DEFAULT 'growth' NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `billing_cycle_months` integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `price_paise` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `payment_status` text DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `payment_link_url` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `service_starts_at` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `service_ends_at` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `created_by` text;--> statement-breakpoint
UPDATE `businesses`
SET `status` = 'active',
	`plan_code` = 'legacy',
	`payment_status` = 'paid',
	`service_starts_at` = `created_at`,
	`service_ends_at` = datetime('now', '+6 months')
WHERE `service_ends_at` IS NULL;--> statement-breakpoint
PRAGMA optimize;
