-- Add drop_bag_items jsonb column to waypoints table
ALTER TABLE "public"."waypoints" ADD COLUMN IF NOT EXISTS "drop_bag_items" jsonb;
