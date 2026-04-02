ALTER TABLE `timer_buckets` ADD `weekly_schedule` text;--> statement-breakpoint
UPDATE timer_buckets SET weekly_schedule = (
  SELECT json_group_object(CAST(je.value AS TEXT), total_minutes)
  FROM json_each(days_of_week) AS je
);