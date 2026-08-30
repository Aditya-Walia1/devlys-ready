CREATE TABLE `businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`owner_email` text,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_businesses_owner_id` ON `businesses` (`owner_id`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`google_review_url` text NOT NULL,
	`brand_color` text DEFAULT '#315efb' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_locations_slug` ON `locations` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_locations_business_id` ON `locations` (`business_id`);--> statement-breakpoint
CREATE TABLE `review_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`location_id` text NOT NULL,
	`session_id` text NOT NULL,
	`event_type` text NOT NULL,
	`rating` integer,
	`topics_json` text,
	`draft_engine` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_review_events_location_created` ON `review_events` (`location_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_review_events_session_created` ON `review_events` (`session_id`,`created_at`);--> statement-breakpoint
PRAGMA optimize;
