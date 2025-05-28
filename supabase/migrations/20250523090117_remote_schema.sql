

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."get_schema_info"() RETURNS TABLE("table_name" "text", "columns" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  return query
  select 
    t.table_name::text,
    jsonb_agg(
      jsonb_build_object(
        'column_name', c.column_name::text,
        'data_type', c.data_type::text,
        'is_nullable', c.is_nullable::text,
        'column_default', c.column_default::text
      )
      order by c.ordinal_position
    ) as columns
  from information_schema.tables t
  join information_schema.columns c 
    on c.table_name = t.table_name 
    and c.table_schema = t.table_schema
  where t.table_schema = 'public'
    and t.table_type = 'BASE TABLE'  -- Only get actual tables, not views
  group by t.table_name;
end;
$$;


ALTER FUNCTION "public"."get_schema_info"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."location_hours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid" NOT NULL,
    "day_of_week" "text" NOT NULL,
    "morning_cutoff" time without time zone NOT NULL,
    "day_start" time without time zone NOT NULL,
    "day_end" time without time zone NOT NULL,
    CONSTRAINT "location_hours_day_of_week_check" CHECK (("day_of_week" = ANY (ARRAY['monday'::"text", 'tuesday'::"text", 'wednesday'::"text", 'thursday'::"text", 'friday'::"text", 'saturday'::"text", 'sunday'::"text"])))
);


ALTER TABLE "public"."location_hours" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "position_id" "uuid",
    "location_id" "uuid"
);


ALTER TABLE "public"."location_positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."manager_locations" (
    "manager_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL
);


ALTER TABLE "public"."manager_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurring_shift_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "position_id" "uuid" NOT NULL,
    "location_name" "text",
    "day_of_week" "text" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "assignment_type" "text" DEFAULT '''regular''::text'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "location_id" "uuid" NOT NULL,
    CONSTRAINT "recurring_shift_assignments_assignment_type_check" CHECK (("assignment_type" = ANY (ARRAY['lead'::"text", 'regular'::"text", 'training'::"text"]))),
    CONSTRAINT "recurring_shift_assignments_day_of_week_check" CHECK (("day_of_week" = ANY (ARRAY['monday'::"text", 'tuesday'::"text", 'wednesday'::"text", 'thursday'::"text", 'friday'::"text", 'saturday'::"text", 'sunday'::"text"])))
);


ALTER TABLE "public"."recurring_shift_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scheduled_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid",
    "worker_id" "uuid",
    "shift_date" "date" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "start_time" time without time zone,
    "end_time" time without time zone,
    "is_recurring_generated" boolean DEFAULT false
);


ALTER TABLE "public"."scheduled_shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shift_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scheduled_shift_id" "uuid",
    "worker_id" "uuid",
    "assignment_type" "text" DEFAULT '''regular''::text'::"text",
    "assigned_start" time without time zone,
    "assigned_end" time without time zone,
    "is_manual_override" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "shift_assignments_assignment_type_check" CHECK (("assignment_type" = ANY (ARRAY['lead'::"text", 'regular'::"text", 'training'::"text"])))
);


ALTER TABLE "public"."shift_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shift_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "position_id" "uuid",
    "location" "text" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "days_of_week" "text"[],
    "location_id" "uuid",
    "lead_type" "text",
    "schedule_column_group" integer,
    CONSTRAINT "shift_templates_days_of_week_check" CHECK (("days_of_week" <@ ARRAY['monday'::"text", 'tuesday'::"text", 'wednesday'::"text", 'thursday'::"text", 'friday'::"text", 'saturday'::"text", 'sunday'::"text"])),
    CONSTRAINT "shift_templates_lead_type_check" CHECK ((("lead_type" = ANY (ARRAY['opening'::"text", 'closing'::"text"])) OR ("lead_type" IS NULL))),
    CONSTRAINT "shift_templates_location_check" CHECK (("location" = ANY (ARRAY['Cupertino'::"text", 'Sunnyvale'::"text"])))
);


ALTER TABLE "public"."shift_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL
);


ALTER TABLE "public"."worker_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_positions" (
    "worker_id" "uuid" NOT NULL,
    "position_id" "uuid" NOT NULL
);


ALTER TABLE "public"."worker_positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location" "text"[],
    "availability" "jsonb",
    "is_lead" boolean DEFAULT false,
    "job_level" "text",
    "created_at" timestamp without time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "first_name" "text",
    "last_name" "text",
    "preferred_name" "text",
    "preferred_hours_per_week" integer,
    "inactive" boolean,
    "user_id" "uuid",
    CONSTRAINT "workers_job_level_check" CHECK (("job_level" = ANY (ARRAY['L1'::"text", 'L2'::"text", 'L3'::"text", 'L4'::"text", 'L5'::"text", 'L6'::"text", 'L7'::"text"]))),
    CONSTRAINT "workers_preferred_hours_per_week_check" CHECK (("preferred_hours_per_week" > 0))
);


ALTER TABLE "public"."workers" OWNER TO "postgres";


ALTER TABLE ONLY "public"."location_hours"
    ADD CONSTRAINT "location_hours_location_id_day_of_week_key" UNIQUE ("location_id", "day_of_week");



ALTER TABLE ONLY "public"."location_hours"
    ADD CONSTRAINT "location_hours_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_positions"
    ADD CONSTRAINT "location_positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manager_locations"
    ADD CONSTRAINT "manager_locations_pkey" PRIMARY KEY ("manager_id", "location_id");



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_shift_assignments"
    ADD CONSTRAINT "recurring_shift_assignments_no_duplicates" UNIQUE ("worker_id", "location_id", "position_id", "day_of_week", "start_time", "end_time");



ALTER TABLE ONLY "public"."recurring_shift_assignments"
    ADD CONSTRAINT "recurring_shift_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scheduled_shifts"
    ADD CONSTRAINT "scheduled_shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shift_assignments"
    ADD CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shift_templates"
    ADD CONSTRAINT "shift_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_locations"
    ADD CONSTRAINT "worker_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_locations"
    ADD CONSTRAINT "worker_locations_worker_id_location_id_key" UNIQUE ("worker_id", "location_id");



ALTER TABLE ONLY "public"."worker_positions"
    ADD CONSTRAINT "worker_positions_pkey" PRIMARY KEY ("worker_id", "position_id");



ALTER TABLE ONLY "public"."workers"
    ADD CONSTRAINT "workers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workers"
    ADD CONSTRAINT "workers_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."location_hours"
    ADD CONSTRAINT "location_hours_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_positions"
    ADD CONSTRAINT "location_positions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_positions"
    ADD CONSTRAINT "location_positions_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."manager_locations"
    ADD CONSTRAINT "manager_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."manager_locations"
    ADD CONSTRAINT "manager_locations_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_shift_assignments"
    ADD CONSTRAINT "recurring_shift_assignments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_shift_assignments"
    ADD CONSTRAINT "recurring_shift_assignments_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_shift_assignments"
    ADD CONSTRAINT "recurring_shift_assignments_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scheduled_shifts"
    ADD CONSTRAINT "scheduled_shifts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."shift_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scheduled_shifts"
    ADD CONSTRAINT "scheduled_shifts_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shift_assignments"
    ADD CONSTRAINT "shift_assignments_scheduled_shift_id_fkey" FOREIGN KEY ("scheduled_shift_id") REFERENCES "public"."scheduled_shifts"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_assignments"
    ADD CONSTRAINT "shift_assignments_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_templates"
    ADD CONSTRAINT "shift_templates_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_templates"
    ADD CONSTRAINT "shift_templates_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_locations"
    ADD CONSTRAINT "worker_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_locations"
    ADD CONSTRAINT "worker_locations_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_positions"
    ADD CONSTRAINT "worker_positions_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_positions"
    ADD CONSTRAINT "worker_positions_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workers"
    ADD CONSTRAINT "workers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



CREATE POLICY "Managers can delete recurring shift assignments" ON "public"."recurring_shift_assignments" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."workers" "w"
     JOIN "public"."worker_locations" "wl" ON (("wl"."worker_id" = "w"."id")))
     JOIN "public"."manager_locations" "ml" ON (("ml"."location_id" = "wl"."location_id")))
  WHERE (("recurring_shift_assignments"."worker_id" = "w"."id") AND ("ml"."manager_id" = "auth"."uid"())))));



CREATE POLICY "Managers can insert recurring shift assignments" ON "public"."recurring_shift_assignments" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."workers" "w"
     JOIN "public"."worker_locations" "wl" ON (("wl"."worker_id" = "w"."id")))
     JOIN "public"."manager_locations" "ml" ON (("ml"."location_id" = "wl"."location_id")))
  WHERE (("recurring_shift_assignments"."worker_id" = "w"."id") AND ("ml"."manager_id" = "auth"."uid"())))));



CREATE POLICY "Managers can manage scheduled shifts" ON "public"."scheduled_shifts" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."shift_templates" "st"
     JOIN "public"."manager_locations" "ml" ON (("ml"."location_id" = "st"."location_id")))
  WHERE (("st"."id" = "scheduled_shifts"."template_id") AND ("ml"."manager_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."shift_templates" "st"
     JOIN "public"."manager_locations" "ml" ON (("ml"."location_id" = "st"."location_id")))
  WHERE (("st"."id" = "scheduled_shifts"."template_id") AND ("ml"."manager_id" = "auth"."uid"())))));



CREATE POLICY "Managers can manage shift assignments" ON "public"."shift_assignments" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."scheduled_shifts" "ss"
     JOIN "public"."shift_templates" "st" ON (("st"."id" = "ss"."template_id")))
     JOIN "public"."manager_locations" "ml" ON (("ml"."location_id" = "st"."location_id")))
  WHERE (("ss"."id" = "shift_assignments"."scheduled_shift_id") AND ("ml"."manager_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."scheduled_shifts" "ss"
     JOIN "public"."shift_templates" "st" ON (("st"."id" = "ss"."template_id")))
     JOIN "public"."manager_locations" "ml" ON (("ml"."location_id" = "st"."location_id")))
  WHERE (("ss"."id" = "shift_assignments"."scheduled_shift_id") AND ("ml"."manager_id" = "auth"."uid"())))));



CREATE POLICY "Managers can manage their workers" ON "public"."workers" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."worker_locations" "wl"
     JOIN "public"."manager_locations" "ml" ON (("ml"."location_id" = "wl"."location_id")))
  WHERE (("wl"."worker_id" = "workers"."id") AND ("ml"."manager_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."worker_locations" "wl"
     JOIN "public"."manager_locations" "ml" ON (("ml"."location_id" = "wl"."location_id")))
  WHERE (("wl"."worker_id" = "workers"."id") AND ("ml"."manager_id" = "auth"."uid"())))));



CREATE POLICY "Managers can manage worker locations" ON "public"."worker_locations" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."manager_locations" "ml"
  WHERE (("ml"."manager_id" = "auth"."uid"()) AND ("ml"."location_id" = "worker_locations"."location_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."manager_locations" "ml"
  WHERE (("ml"."manager_id" = "auth"."uid"()) AND ("ml"."location_id" = "worker_locations"."location_id")))));



CREATE POLICY "Managers can manage worker positions" ON "public"."worker_positions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."worker_locations" "wl"
     JOIN "public"."manager_locations" "ml" ON (("ml"."location_id" = "wl"."location_id")))
  WHERE (("wl"."worker_id" = "worker_positions"."worker_id") AND ("ml"."manager_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."worker_locations" "wl"
     JOIN "public"."manager_locations" "ml" ON (("ml"."location_id" = "wl"."location_id")))
  WHERE (("wl"."worker_id" = "worker_positions"."worker_id") AND ("ml"."manager_id" = "auth"."uid"())))));



CREATE POLICY "Managers can see their own assigned locations" ON "public"."manager_locations" FOR SELECT TO "authenticated" USING (("manager_id" = "auth"."uid"()));



CREATE POLICY "Managers can update recurring shift assignments" ON "public"."recurring_shift_assignments" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."workers" "w"
     JOIN "public"."worker_locations" "wl" ON (("wl"."worker_id" = "w"."id")))
     JOIN "public"."manager_locations" "ml" ON (("ml"."location_id" = "wl"."location_id")))
  WHERE (("recurring_shift_assignments"."worker_id" = "w"."id") AND ("ml"."manager_id" = "auth"."uid"())))));



CREATE POLICY "Managers can view positions for their locations" ON "public"."location_positions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."manager_locations" "ml"
  WHERE (("ml"."manager_id" = "auth"."uid"()) AND ("ml"."location_id" = "location_positions"."location_id")))));



CREATE POLICY "Managers can view recurring shift assignments" ON "public"."recurring_shift_assignments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."workers" "w"
     JOIN "public"."worker_locations" "wl" ON (("wl"."worker_id" = "w"."id")))
     JOIN "public"."manager_locations" "ml" ON (("wl"."location_id" = "ml"."location_id")))
  WHERE (("recurring_shift_assignments"."worker_id" = "w"."id") AND ("ml"."manager_id" = "auth"."uid"())))));



CREATE POLICY "Managers can view scheduled shifts for their locations" ON "public"."scheduled_shifts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."shift_templates" "st"
     JOIN "public"."manager_locations" "ml" ON (("ml"."location_id" = "st"."location_id")))
  WHERE (("st"."id" = "scheduled_shifts"."template_id") AND ("ml"."manager_id" = "auth"."uid"())))));



CREATE POLICY "Managers can view shift assignments for their locations" ON "public"."shift_assignments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."scheduled_shifts" "ss"
     JOIN "public"."shift_templates" "st" ON (("st"."id" = "ss"."template_id")))
     JOIN "public"."manager_locations" "ml" ON (("ml"."location_id" = "st"."location_id")))
  WHERE (("ss"."id" = "shift_assignments"."scheduled_shift_id") AND ("ml"."manager_id" = "auth"."uid"())))));



CREATE POLICY "Managers can view shift templates for their locations" ON "public"."shift_templates" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."manager_locations" "ml"
  WHERE (("ml"."manager_id" = "auth"."uid"()) AND ("ml"."location_id" = "shift_templates"."location_id")))));



CREATE POLICY "Managers can view store hours for their locations" ON "public"."location_hours" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."manager_locations" "ml"
  WHERE (("ml"."manager_id" = "auth"."uid"()) AND ("ml"."location_id" = "location_hours"."location_id")))));



CREATE POLICY "Managers can view their locations" ON "public"."locations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."manager_locations" "ml"
  WHERE (("ml"."manager_id" = "auth"."uid"()) AND ("ml"."location_id" = "locations"."id")))));



CREATE POLICY "Managers can view worker-location links" ON "public"."worker_locations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."manager_locations" "ml"
  WHERE (("ml"."manager_id" = "auth"."uid"()) AND ("ml"."location_id" = "worker_locations"."location_id")))));



CREATE POLICY "Managers can view worker-positions for their locations" ON "public"."worker_positions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."worker_locations" "wl"
     JOIN "public"."manager_locations" "ml" ON (("wl"."location_id" = "ml"."location_id")))
  WHERE (("wl"."worker_id" = "worker_positions"."worker_id") AND ("ml"."manager_id" = "auth"."uid"())))));



CREATE POLICY "Managers can view workers they manage" ON "public"."workers" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."worker_locations" "wl"
     JOIN "public"."manager_locations" "ml" ON (("wl"."location_id" = "ml"."location_id")))
  WHERE (("wl"."worker_id" = "workers"."id") AND ("ml"."manager_id" = "auth"."uid"())))));



ALTER TABLE "public"."location_hours" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."location_positions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."manager_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."positions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurring_shift_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scheduled_shifts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shift_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shift_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."worker_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."worker_positions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workers" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";




















































































































































































GRANT ALL ON FUNCTION "public"."get_schema_info"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_schema_info"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_schema_info"() TO "service_role";



























GRANT ALL ON TABLE "public"."location_hours" TO "anon";
GRANT ALL ON TABLE "public"."location_hours" TO "authenticated";
GRANT ALL ON TABLE "public"."location_hours" TO "service_role";



GRANT ALL ON TABLE "public"."location_positions" TO "anon";
GRANT ALL ON TABLE "public"."location_positions" TO "authenticated";
GRANT ALL ON TABLE "public"."location_positions" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."manager_locations" TO "anon";
GRANT ALL ON TABLE "public"."manager_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."manager_locations" TO "service_role";



GRANT ALL ON TABLE "public"."positions" TO "anon";
GRANT ALL ON TABLE "public"."positions" TO "authenticated";
GRANT ALL ON TABLE "public"."positions" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_shift_assignments" TO "anon";
GRANT ALL ON TABLE "public"."recurring_shift_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_shift_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."scheduled_shifts" TO "anon";
GRANT ALL ON TABLE "public"."scheduled_shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_shifts" TO "service_role";



GRANT ALL ON TABLE "public"."shift_assignments" TO "anon";
GRANT ALL ON TABLE "public"."shift_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."shift_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."shift_templates" TO "anon";
GRANT ALL ON TABLE "public"."shift_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."shift_templates" TO "service_role";



GRANT ALL ON TABLE "public"."worker_locations" TO "anon";
GRANT ALL ON TABLE "public"."worker_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."worker_locations" TO "service_role";



GRANT ALL ON TABLE "public"."worker_positions" TO "anon";
GRANT ALL ON TABLE "public"."worker_positions" TO "authenticated";
GRANT ALL ON TABLE "public"."worker_positions" TO "service_role";



GRANT ALL ON TABLE "public"."workers" TO "anon";
GRANT ALL ON TABLE "public"."workers" TO "authenticated";
GRANT ALL ON TABLE "public"."workers" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
