CREATE TABLE "repo_audits" (
	"repo_id" integer PRIMARY KEY NOT NULL,
	"audited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_login" text,
	"owner_type" text,
	"owner_created_at" timestamp with time zone,
	"owner_followers" integer,
	"owner_repos" integer,
	"commit_count" integer,
	"recent_authors" integer,
	"last_commit_at" timestamp with time zone,
	"has_readme" boolean DEFAULT false NOT NULL,
	"readme_bytes" integer,
	"has_security_policy" boolean DEFAULT false NOT NULL,
	"has_code_of_conduct" boolean DEFAULT false NOT NULL,
	"release_count" integer,
	"executable_assets" text[] DEFAULT '{}' NOT NULL,
	"stargazer_sample" integer DEFAULT 0 NOT NULL,
	"suspicious_star_share" real,
	"ghost_star_share" real,
	"star_burst_share" real,
	"fork_sample" integer DEFAULT 0 NOT NULL,
	"suspicious_fork_share" real,
	"scorecard" real,
	"scorecard_checks" jsonb,
	"lure_patterns" text[] DEFAULT '{}' NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"trust_score" integer NOT NULL,
	"quality_score" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "compat" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "trust_score" integer;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "quality_score" integer;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "audited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repo_audits" ADD CONSTRAINT "repo_audits_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;