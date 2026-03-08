ALTER TABLE "tenants" ADD COLUMN "onboarding_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "onboarding_step" text DEFAULT 'welcome';--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "wallet_address" text;