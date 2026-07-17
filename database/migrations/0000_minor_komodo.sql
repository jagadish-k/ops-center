CREATE TABLE "audit_ledger" (
	"event_id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"timestamp" integer NOT NULL,
	"actor_uid" text NOT NULL,
	"actor_role" text NOT NULL,
	"actor_phone_email" text,
	"action" text NOT NULL,
	"target_resource_id" text NOT NULL,
	"state_delta" jsonb,
	"delta_sha" text NOT NULL,
	"chained_prior_hash" text NOT NULL,
	"cryptographic_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config" (
	"id" text PRIMARY KEY DEFAULT 'switch' NOT NULL,
	"window_start" timestamp with time zone,
	"window_end" timestamp with time zone,
	"operational" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatches" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"incident_id" text NOT NULL,
	"target_staff_phone" text NOT NULL,
	"directive_text" text NOT NULL,
	"status" text DEFAULT 'SENT' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ack_at" timestamp with time zone,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"source" text DEFAULT 'field_staff' NOT NULL,
	"tier" smallint NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"raw_text" text NOT NULL,
	"category" text,
	"severity" text,
	"location_sector" text,
	"action_required" text,
	"coord_x" integer,
	"coord_y" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_sessions" (
	"phone" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"name" text PRIMARY KEY NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_name" text NOT NULL,
	"permission_name" text NOT NULL,
	CONSTRAINT "role_permissions_role_name_permission_name_pk" PRIMARY KEY("role_name","permission_name")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"name" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_roster" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"specialty" text,
	"assigned_zone" text NOT NULL,
	"status" text DEFAULT 'AVAILABLE' NOT NULL,
	"phone_number" text NOT NULL,
	"coord_x" integer,
	"coord_y" integer,
	"latitude" double precision,
	"longitude" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_memberships" (
	"user_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"roles" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_memberships_user_id_tenant_id_pk" PRIMARY KEY("user_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"org_name" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bbox_min_lat" double precision,
	"bbox_max_lat" double precision,
	"bbox_min_lng" double precision,
	"bbox_max_lng" double precision
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"user_id" uuid NOT NULL,
	"permission_name" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" uuid,
	CONSTRAINT "user_permissions_user_id_permission_name_pk" PRIMARY KEY("user_id","permission_name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text,
	"email" text,
	"full_name" text NOT NULL,
	"global_role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"perms_version" integer DEFAULT 1 NOT NULL,
	"auth_provider" text DEFAULT 'phone_otp' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_ledger" ADD CONSTRAINT "audit_ledger_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_name_roles_name_fk" FOREIGN KEY ("role_name") REFERENCES "public"."roles"("name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roster" ADD CONSTRAINT "staff_roster_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roster" ADD CONSTRAINT "staff_roster_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_tenant_ts" ON "audit_ledger" USING btree ("tenant_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_dispatch_staff" ON "dispatches" USING btree ("target_staff_phone","status");--> statement-breakpoint
CREATE INDEX "idx_dispatch_tenant" ON "dispatches" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_inc_tenant_updated" ON "incidents" USING btree ("tenant_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_staff_user_tenant" ON "staff_roster" USING btree ("user_id","tenant_id");--> statement-breakpoint
CREATE INDEX "idx_staff_tenant" ON "staff_roster" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_memberships_tenant" ON "tenant_memberships" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_user_perms_user" ON "user_permissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_users_global_role" ON "users" USING btree ("global_role");--> statement-breakpoint
CREATE INDEX "idx_users_status" ON "users" USING btree ("status");
--> statement-breakpoint

-- ─── Triggers (not expressible in Drizzle schema definitions) ────────────────
-- Carried forward from legacy 0001_init.sql + 0003_audit_ledger.sql.

-- updated_at auto-touch function (used by incidents, staff_roster, users).
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_incidents_touch ON incidents;
CREATE TRIGGER trg_incidents_touch BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_staff_touch ON staff_roster;
CREATE TRIGGER trg_staff_touch BEFORE UPDATE ON staff_roster
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_users_touch ON users;
CREATE TRIGGER trg_users_touch BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();--> statement-breakpoint

-- Audit ledger WORM enforcement (ADR-0005, ADR-0009) — rejects UPDATE/DELETE.
CREATE OR REPLACE FUNCTION reject_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_ledger is append-only (WORM) — modifications are forbidden';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS audit_no_update ON audit_ledger;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_ledger
    FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();--> statement-breakpoint

DROP TRIGGER IF EXISTS audit_no_delete ON audit_ledger;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_ledger
    FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();