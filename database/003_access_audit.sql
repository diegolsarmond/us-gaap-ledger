BEGIN;
CREATE TABLE IF NOT EXISTS access_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(120) NOT NULL UNIQUE,
 manage_users boolean NOT NULL DEFAULT false, manage_profiles boolean NOT NULL DEFAULT false,
 view_audit boolean NOT NULL DEFAULT false, write_cash boolean NOT NULL DEFAULT false,
 system_admin boolean NOT NULL DEFAULT false
);
INSERT INTO access_profiles(name,manage_users,manage_profiles,view_audit,write_cash,system_admin) VALUES
 ('Administrador',true,true,true,true,true),('Operador financeiro',false,false,false,true,false),('Consulta',false,false,false,false,false) ON CONFLICT (name) DO NOTHING;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES access_profiles(id);
-- Bootstrap only an unassigned oldest account; preserve existing permissions.
UPDATE app_users SET profile_id=(SELECT id FROM access_profiles WHERE name='Administrador')
 WHERE profile_id IS NULL
 AND id=(SELECT id FROM app_users ORDER BY created_at,id LIMIT 1)
 AND NOT EXISTS (SELECT 1 FROM app_users u JOIN access_profiles p ON p.id=u.profile_id WHERE p.system_admin);
UPDATE app_users SET profile_id=(SELECT id FROM access_profiles WHERE name='Operador financeiro')
 WHERE profile_id IS NULL;
CREATE TABLE IF NOT EXISTS system_audit_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, occurred_at timestamptz NOT NULL DEFAULT now(),
 actor_id uuid, actor_name text NOT NULL, action text NOT NULL, entity text NOT NULL, target_id text NOT NULL,
 before_data jsonb, after_data jsonb
);
CREATE INDEX IF NOT EXISTS system_audit_time_idx ON system_audit_log(occurred_at DESC,id DESC);
CREATE OR REPLACE FUNCTION record_system_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous jsonb; following jsonb; actor uuid; actor_label text;
BEGIN
 IF TG_OP <> 'INSERT' THEN previous := to_jsonb(OLD) - 'password_hash'; END IF;
 IF TG_OP <> 'DELETE' THEN following := to_jsonb(NEW) - 'password_hash'; END IF;
 actor := nullif(current_setting('app.actor_id',true),'')::uuid;
 IF actor IS NULL AND TG_TABLE_NAME IN ('cash_accounts','cash_transactions') THEN actor := coalesce(following,previous)->>'user_id'; END IF;
 SELECT name INTO actor_label FROM app_users WHERE id=actor;
 INSERT INTO system_audit_log(actor_id,actor_name,action,entity,target_id,before_data,after_data)
 VALUES(actor,coalesce(actor_label,'Sistema'),TG_OP,TG_TABLE_NAME,coalesce(following,previous)->>'id',previous,following);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
-- Check triggers per table in the current schema; do not remove existing triggers.
DO $$
DECLARE entry record;
BEGIN
 FOR entry IN SELECT * FROM (VALUES
  ('audit_users','app_users'),
  ('audit_profiles','access_profiles'),
  ('audit_cash_accounts','cash_accounts'),
  ('audit_cash_transactions','cash_transactions')
 ) AS triggers(trigger_name, table_name)
 LOOP
  IF NOT EXISTS (
   SELECT 1 FROM pg_trigger
   WHERE tgname=entry.trigger_name AND tgrelid=to_regclass(entry.table_name) AND NOT tgisinternal
  ) THEN
   EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION record_system_audit()',entry.trigger_name,entry.table_name);
  END IF;
 END LOOP;
END; $$;
COMMIT;
