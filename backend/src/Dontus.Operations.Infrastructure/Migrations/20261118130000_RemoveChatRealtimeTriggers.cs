using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Dontus.Operations.Infrastructure.Migrations;

// Chat notifications now come from InternalChatService, once per action and with the room id.
[DbContext(typeof(OperationsDbContext))]
[Migration("20261118130000_RemoveChatRealtimeTriggers")]
public sealed class RemoveChatRealtimeTriggers : Migration
{
    private static readonly string[] ChatTables =
    [
        "internal_chat_rooms", "internal_chat_room_members", "internal_chat_messages",
        "internal_chat_message_receipts", "internal_chat_message_reactions",
    ];

    protected override void Up(MigrationBuilder migrationBuilder)
    {
        foreach (var table in ChatTables)
            migrationBuilder.Sql($"DROP TRIGGER IF EXISTS dontus_realtime ON {table};");
    }

    // dontus_notify_chat() is kept, so rolling back restores the original per-row triggers.
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        foreach (var table in ChatTables)
            migrationBuilder.Sql($"""
                DROP TRIGGER IF EXISTS dontus_realtime ON {table};
                CREATE TRIGGER dontus_realtime AFTER INSERT OR UPDATE OR DELETE ON {table}
                    FOR EACH ROW EXECUTE FUNCTION dontus_notify_chat();
                """);
    }
}
