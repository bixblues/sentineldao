ALTER TABLE "tenants" ADD COLUMN "ccip_sender_address" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "ccip_receiver_arbitrum" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "ccip_receiver_base" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "ccip_enabled" boolean DEFAULT false NOT NULL;