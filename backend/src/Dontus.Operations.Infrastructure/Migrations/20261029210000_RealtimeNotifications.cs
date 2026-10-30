using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Dontus.Operations.Infrastructure.Migrations;

[DbContext(typeof(OperationsDbContext))]
[Migration("20261029210000_RealtimeNotifications")]
public sealed class RealtimeNotifications : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        CREATE FUNCTION dontus_notify_operations() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          PERFORM pg_notify('dontus_realtime', '{"topic":"operations"}');
          RETURN NULL;
        END $$;
        CREATE FUNCTION dontus_notify_user_change() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF TG_OP <> 'UPDATE' OR
             (to_jsonb(NEW) - ARRAY['LastAccessAt','UpdatedAt','Version']) IS DISTINCT FROM
             (to_jsonb(OLD) - ARRAY['LastAccessAt','UpdatedAt','Version']) THEN
            PERFORM pg_notify('dontus_realtime', '{"topic":"operations"}');
          END IF;
          RETURN NULL;
        END $$;
        CREATE FUNCTION dontus_notify_chat() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE room_id uuid; changed_user uuid; recipient uuid;
        BEGIN
          IF TG_TABLE_NAME = 'internal_chat_rooms' THEN
            room_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."Id" ELSE NEW."Id" END;
          ELSE
            room_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."RoomId" ELSE NEW."RoomId" END;
          END IF;
          IF TG_TABLE_NAME = 'internal_chat_room_members' THEN
            changed_user := CASE WHEN TG_OP = 'DELETE' THEN OLD."UserId" ELSE NEW."UserId" END;
          END IF;
          FOR recipient IN SELECT "UserId" FROM internal_chat_room_members WHERE "RoomId" = room_id
                           UNION SELECT changed_user WHERE changed_user IS NOT NULL LOOP
            PERFORM pg_notify('dontus_realtime', json_build_object('topic','chat','userId',recipient)::text);
          END LOOP;
          RETURN NULL;
        END $$;
        DO $$ DECLARE table_name text; BEGIN
          -- Audit/history and session bookkeeping must not wake every screen on chat reads or heartbeats.
          FOREACH table_name IN ARRAY ARRAY[
            'access_groups','agenda_calendars','agenda_commitment_participants','agenda_commitments',
            'agenda_statuses','agenda_types','appointments','approvals','chat_channels','chat_contacts',
            'chat_conversation_tags','chat_conversations','chat_messages','chat_queues','chat_quick_replies',
            'chat_tags','chat_transfers','chat_whatsapp_numbers','commission_confirmations',
            'company_notice_reads','company_notices','corporate_tasks','customer_catalog_options',
            'customer_dontus_links','customers','decision_items','employee_levels','employee_supervisions',
            'group_permissions','lia_form_requests','lia_forms','service_request_ai_settings',
            'suggestion_attachments','suggestion_comments','suggestion_priorities','suggestion_statuses',
            'suggestions','task_attachments','task_client_communications','task_comments','task_departments',
            'task_notifications','task_participants','task_priorities','task_sla_pause_statuses',
            'task_sla_policies','task_statuses','task_transfers','task_type_departments','task_type_statuses',
            'task_types','user_access_groups','user_agenda_calendar_accesses','user_agenda_department_accesses',
            'user_departments','work_items'
          ] LOOP
            EXECUTE format('CREATE TRIGGER dontus_realtime AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION dontus_notify_operations()', table_name);
          END LOOP;
          FOREACH table_name IN ARRAY ARRAY['internal_chat_rooms','internal_chat_room_members','internal_chat_messages'] LOOP
            EXECUTE format('CREATE TRIGGER dontus_realtime AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION dontus_notify_chat()', table_name);
          END LOOP;
        END $$;
        CREATE TRIGGER dontus_realtime AFTER INSERT OR UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION dontus_notify_user_change();
        """);

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        DROP FUNCTION IF EXISTS dontus_notify_operations() CASCADE;
        DROP FUNCTION IF EXISTS dontus_notify_user_change() CASCADE;
        DROP FUNCTION IF EXISTS dontus_notify_chat() CASCADE;
        """);
}
