CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"ip" text,
	"request_body" jsonb,
	"response_status" integer,
	"duration_ms" integer,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "threats" ADD COLUMN "ai_risk_score" integer;--> statement-breakpoint
ALTER TABLE "threats" ADD COLUMN "ai_confidence" integer;--> statement-breakpoint
ALTER TABLE "threats" ADD COLUMN "ai_reasoning" text;--> statement-breakpoint
ALTER TABLE "threats" ADD COLUMN "ai_attack_vector" text;--> statement-breakpoint
ALTER TABLE "threats" ADD COLUMN "ai_recommendations" jsonb;