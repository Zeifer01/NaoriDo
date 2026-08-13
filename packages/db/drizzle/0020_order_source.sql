CREATE TYPE "public"."order_source" AS ENUM('pos', 'online');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "source" "order_source";
