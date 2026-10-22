CREATE TABLE "connector_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_key" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"items_fetched" integer DEFAULT 0 NOT NULL,
	"items_new" integer DEFAULT 0 NOT NULL,
	"items_updated" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"error" text,
	"snapshot_key" text
);
--> statement-breakpoint
CREATE TABLE "publication_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"trend_id" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"note" text,
	"snapshot" jsonb
);
--> statement-breakpoint
CREATE TABLE "repo_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"repo_id" integer NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stars" integer NOT NULL,
	"forks" integer NOT NULL,
	"open_issues" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" serial PRIMARY KEY NOT NULL,
	"github_id" bigint NOT NULL,
	"node_id" text,
	"full_name" text NOT NULL,
	"display_name" text NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"homepage" text,
	"language" text,
	"topics" text[] DEFAULT '{}' NOT NULL,
	"license" text,
	"is_fork" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at_gh" timestamp with time zone NOT NULL,
	"pushed_at" timestamp with time zone,
	"updated_at_gh" timestamp with time zone,
	"stars" integer DEFAULT 0 NOT NULL,
	"forks" integer DEFAULT 0 NOT NULL,
	"open_issues" integer DEFAULT 0 NOT NULL,
	"latest_release_tag" text,
	"latest_release_at" timestamp with time zone,
	"category" text DEFAULT 'other' NOT NULL,
	"project_type" text DEFAULT 'tool' NOT NULL,
	"maturity" text DEFAULT 'experimental' NOT NULL,
	"stars_delta_24h" integer,
	"stars_delta_7d" integer,
	"growth_validated" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_key" text NOT NULL,
	"platform" text NOT NULL,
	"kind" text DEFAULT 'article' NOT NULL,
	"external_id" text NOT NULL,
	"url" text NOT NULL,
	"discussion_url" text,
	"canonical_url" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"author" text,
	"published_at" timestamp with time zone,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_hash" text NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metrics_observed_at" timestamp with time zone,
	"linked_repo" text,
	"repo_id" integer,
	"trend_id" integer
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"platform" text NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"category" text,
	"official" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"quality" real DEFAULT 0.6 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"last_run_at" timestamp with time zone,
	"last_status" text,
	"last_error" text,
	"last_item_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trend_score_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"trend_id" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"score" real NOT NULL,
	"confidence" real NOT NULL,
	"stage" text NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"inputs_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trends" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_key" text NOT NULL,
	"slug" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"recommendation" text,
	"manual_override" boolean DEFAULT false NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"primary_url" text NOT NULL,
	"repo_id" integer,
	"platforms" text[] DEFAULT '{}' NOT NULL,
	"signal_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'detected' NOT NULL,
	"stage" text DEFAULT 'to_validate' NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"velocity" real,
	"velocity_basis" text DEFAULT 'none' NOT NULL,
	"maturity" text,
	"experiment_cost" text,
	"risk" text,
	"source_quality" real DEFAULT 0 NOT NULL,
	"inputs_hash" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"first_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_signal_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scored_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publication_events" ADD CONSTRAINT "publication_events_trend_id_trends_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_snapshots" ADD CONSTRAINT "repo_snapshots_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_trend_id_trends_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trends"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_score_history" ADD CONSTRAINT "trend_score_history_trend_id_trends_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trends" ADD CONSTRAINT "trends_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connector_runs_source_idx" ON "connector_runs" USING btree ("source_key","started_at");--> statement-breakpoint
CREATE INDEX "publication_events_trend_idx" ON "publication_events" USING btree ("trend_id","at");--> statement-breakpoint
CREATE INDEX "repo_snapshots_repo_idx" ON "repo_snapshots" USING btree ("repo_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "repositories_github_id_uq" ON "repositories" USING btree ("github_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repositories_full_name_uq" ON "repositories" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "repositories_created_idx" ON "repositories" USING btree ("created_at_gh");--> statement-breakpoint
CREATE INDEX "repositories_first_seen_idx" ON "repositories" USING btree ("first_seen_at");--> statement-breakpoint
CREATE INDEX "repositories_pushed_idx" ON "repositories" USING btree ("pushed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "signals_source_external_uq" ON "signals" USING btree ("source_key","external_id");--> statement-breakpoint
CREATE INDEX "signals_canonical_idx" ON "signals" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "signals_trend_idx" ON "signals" USING btree ("trend_id");--> statement-breakpoint
CREATE INDEX "signals_observed_idx" ON "signals" USING btree ("observed_at");--> statement-breakpoint
CREATE INDEX "trend_score_history_trend_idx" ON "trend_score_history" USING btree ("trend_id","computed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trends_entity_key_uq" ON "trends" USING btree ("entity_key");--> statement-breakpoint
CREATE UNIQUE INDEX "trends_slug_uq" ON "trends" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "trends_score_idx" ON "trends" USING btree ("score");--> statement-breakpoint
CREATE INDEX "trends_status_idx" ON "trends" USING btree ("status");--> statement-breakpoint
CREATE INDEX "trends_last_signal_idx" ON "trends" USING btree ("last_signal_at");