-- Audit payloads vary by entity. Store their tree as typed relational nodes;
-- JSON is constructed only at the compatibility view boundary, never persisted.
BEGIN;
DO $$ BEGIN
 IF to_regclass('system_audit_events') IS NULL THEN
  ALTER TABLE system_audit_log RENAME TO system_audit_events;
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS system_audit_fields (
 event_id bigint NOT NULL REFERENCES system_audit_events(id),
 snapshot text NOT NULL CHECK(snapshot IN ('before','after')),
 path text[] NOT NULL,
 kind text NOT NULL CHECK(kind IN ('object','array','string','number','boolean','null')),
 text_value text, number_value numeric, boolean_value boolean,
 PRIMARY KEY(event_id,snapshot,path),
 CHECK ((kind='string') = (text_value IS NOT NULL)),
 CHECK ((kind='number') = (number_value IS NOT NULL)),
 CHECK ((kind='boolean') = (boolean_value IS NOT NULL))
);
CREATE OR REPLACE FUNCTION store_audit_snapshot(event bigint, side text, payload jsonb, node_path text[] DEFAULT ARRAY[]::text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE item record; node_kind text;
BEGIN
 IF payload IS NULL THEN RETURN; END IF;
 node_kind := jsonb_typeof(payload);
 INSERT INTO system_audit_fields(event_id,snapshot,path,kind,text_value,number_value,boolean_value)
 VALUES(event,side,node_path,node_kind,
 CASE WHEN node_kind='string' THEN payload#>>'{}' END,
 CASE WHEN node_kind='number' THEN (payload#>>'{}')::numeric END,
 CASE WHEN node_kind='boolean' THEN (payload#>>'{}')::boolean END);
 IF node_kind='object' THEN
  FOR item IN SELECT key,value FROM jsonb_each(payload) LOOP
   PERFORM store_audit_snapshot(event,side,item.value,array_append(node_path,item.key));
  END LOOP;
 ELSIF node_kind='array' THEN
  FOR item IN SELECT value,(ordinality-1)::text AS key FROM jsonb_array_elements(payload) WITH ORDINALITY LOOP
   PERFORM store_audit_snapshot(event,side,item.value,array_append(node_path,item.key));
  END LOOP;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION read_audit_snapshot(event bigint, side text, node_path text[] DEFAULT ARRAY[]::text[])
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE node system_audit_fields%ROWTYPE; result jsonb; item record; depth integer := cardinality(node_path);
BEGIN
 SELECT * INTO node FROM system_audit_fields WHERE event_id=event AND snapshot=side AND path=node_path;
 IF NOT FOUND THEN RETURN NULL; END IF;
 CASE node.kind
 WHEN 'string' THEN RETURN to_jsonb(node.text_value);
 WHEN 'number' THEN RETURN to_jsonb(node.number_value);
 WHEN 'boolean' THEN RETURN to_jsonb(node.boolean_value);
 WHEN 'null' THEN RETURN 'null'::jsonb;
 ELSE
  result := CASE WHEN node.kind='array' THEN '[]'::jsonb ELSE '{}'::jsonb END;
  FOR item IN SELECT path FROM system_audit_fields
   WHERE event_id=event AND snapshot=side AND cardinality(path)=depth+1
   AND (depth=0 OR path[1:depth]=node_path)
   ORDER BY CASE WHEN node.kind='array' THEN path[depth+1]::integer END,path
  LOOP
   IF node.kind='array' THEN
    result := result || jsonb_build_array(read_audit_snapshot(event,side,item.path));
   ELSE
    result := result || jsonb_build_object(item.path[depth+1],read_audit_snapshot(event,side,item.path));
   END IF;
  END LOOP;
  RETURN result;
 END CASE;
END $$;
DO $$ DECLARE event record; BEGIN
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='system_audit_events'::regclass AND attname='before_data' AND NOT attisdropped) THEN
  FOR event IN SELECT id,before_data,after_data FROM system_audit_events LOOP
   PERFORM store_audit_snapshot(event.id,'before',event.before_data);
   PERFORM store_audit_snapshot(event.id,'after',event.after_data);
  END LOOP;
  ALTER TABLE system_audit_events DROP COLUMN before_data, DROP COLUMN after_data;
 END IF;
END $$;
CREATE OR REPLACE VIEW system_audit_log AS
 SELECT id,occurred_at,actor_id,actor_name,action,entity,target_id,
 read_audit_snapshot(id,'before') AS before_data,read_audit_snapshot(id,'after') AS after_data,company_id
 FROM system_audit_events;
CREATE OR REPLACE FUNCTION insert_structured_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO system_audit_events(occurred_at,actor_id,actor_name,action,entity,target_id,company_id)
 VALUES(coalesce(NEW.occurred_at,now()),NEW.actor_id,NEW.actor_name,NEW.action,NEW.entity,NEW.target_id,NEW.company_id)
 RETURNING id,occurred_at INTO NEW.id,NEW.occurred_at;
 PERFORM store_audit_snapshot(NEW.id,'before',NEW.before_data);
 PERFORM store_audit_snapshot(NEW.id,'after',NEW.after_data);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS insert_structured_audit ON system_audit_log;
CREATE TRIGGER insert_structured_audit INSTEAD OF INSERT ON system_audit_log FOR EACH ROW EXECUTE FUNCTION insert_structured_audit();
COMMIT;
