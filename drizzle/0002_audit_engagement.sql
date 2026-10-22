ALTER TABLE "repo_audits" ADD COLUMN "watchers_count" integer;--> statement-breakpoint
ALTER TABLE "repo_audits" ADD COLUMN "watcher_sample" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "repo_audits" ADD COLUMN "suspicious_watcher_share" real;--> statement-breakpoint
ALTER TABLE "repo_audits" ADD COLUMN "forks_per_star" real;--> statement-breakpoint
ALTER TABLE "repo_audits" ADD COLUMN "watchers_per_star" real;