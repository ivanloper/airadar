CREATE TABLE "ai_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"purpose" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "trend_analyses" (
	"trend_id" integer PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"inputs_hash" text NOT NULL,
	"signal_count" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repo_audits" ADD COLUMN "readme_excerpt" text;--> statement-breakpoint
ALTER TABLE "trends" ADD COLUMN "alerted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trend_analyses" ADD CONSTRAINT "trend_analyses_trend_id_trends_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_at_idx" ON "ai_usage" USING btree ("at");--> statement-breakpoint
CREATE INDEX "trend_analyses_created_idx" ON "trend_analyses" USING btree ("created_at");