CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"claude_session_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timer_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"total_minutes" integer NOT NULL,
	"color_index" integer NOT NULL,
	"days_of_week" jsonb NOT NULL,
	"weekly_schedule" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timer_daily_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket_id" uuid NOT NULL,
	"date" date NOT NULL,
	"elapsed_seconds" integer DEFAULT 0 NOT NULL,
	"started_at" text,
	"goal_reached_at" text,
	"dismissed_at" text,
	"target_minutes_override" integer,
	CONSTRAINT "uq_bucket_date" UNIQUE("bucket_id","date")
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timer_daily_progress" ADD CONSTRAINT "timer_daily_progress_bucket_id_timer_buckets_id_fk" FOREIGN KEY ("bucket_id") REFERENCES "public"."timer_buckets"("id") ON DELETE no action ON UPDATE no action;