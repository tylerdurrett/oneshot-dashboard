CREATE TABLE `timer_buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`total_minutes` integer NOT NULL,
	`color_index` integer NOT NULL,
	`days_of_week` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `timer_daily_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`bucket_id` text NOT NULL,
	`date` text NOT NULL,
	`elapsed_seconds` integer DEFAULT 0 NOT NULL,
	`started_at` text,
	`completed_at` text,
	FOREIGN KEY (`bucket_id`) REFERENCES `timer_buckets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_bucket_date` ON `timer_daily_progress` (`bucket_id`,`date`);