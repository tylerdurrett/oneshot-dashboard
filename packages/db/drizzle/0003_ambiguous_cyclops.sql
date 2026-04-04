ALTER TABLE "documents" ADD COLUMN "is_title_manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "title_generated_from_block_ids" text[];