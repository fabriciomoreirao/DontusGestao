using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InternalChatReceiptsAndReactions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "internal_chat_message_reactions",
                columns: table => new
                {
                    MessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RoomId = table.Column<Guid>(type: "uuid", nullable: false),
                    Emoji = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ReactedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_internal_chat_message_reactions", x => new { x.MessageId, x.UserId });
                    table.ForeignKey(
                        name: "FK_internal_chat_message_reactions_internal_chat_messages_Mess~",
                        column: x => x.MessageId,
                        principalTable: "internal_chat_messages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_internal_chat_message_reactions_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "internal_chat_message_receipts",
                columns: table => new
                {
                    MessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RoomId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReadAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_internal_chat_message_receipts", x => new { x.MessageId, x.UserId });
                    table.ForeignKey(
                        name: "FK_internal_chat_message_receipts_internal_chat_messages_Messa~",
                        column: x => x.MessageId,
                        principalTable: "internal_chat_messages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_internal_chat_message_receipts_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_internal_chat_message_reactions_RoomId",
                table: "internal_chat_message_reactions",
                column: "RoomId");

            migrationBuilder.CreateIndex(
                name: "IX_internal_chat_message_reactions_UserId",
                table: "internal_chat_message_reactions",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_internal_chat_message_receipts_RoomId",
                table: "internal_chat_message_receipts",
                column: "RoomId");

            migrationBuilder.CreateIndex(
                name: "IX_internal_chat_message_receipts_UserId",
                table: "internal_chat_message_receipts",
                column: "UserId");
            migrationBuilder.Sql("""
                INSERT INTO internal_chat_message_receipts ("RoomId", "MessageId", "UserId", "ReadAt")
                SELECT message."RoomId", message."Id", member."UserId", member."LastReadAt"
                FROM internal_chat_messages message
                JOIN internal_chat_room_members member ON member."RoomId" = message."RoomId"
                WHERE member."UserId" <> message."SenderUserId" AND member."JoinedAt" <= message."CreatedAt"
                    AND member."LastReadAt" >= message."CreatedAt" AND message."Type" <> 'pin' AND message."DeletedAt" IS NULL
                ON CONFLICT ("MessageId", "UserId") DO NOTHING;
                CREATE TRIGGER dontus_realtime AFTER INSERT OR UPDATE OR DELETE ON internal_chat_message_receipts
                    FOR EACH ROW EXECUTE FUNCTION dontus_notify_chat();
                CREATE TRIGGER dontus_realtime AFTER INSERT OR UPDATE OR DELETE ON internal_chat_message_reactions
                    FOR EACH ROW EXECUTE FUNCTION dontus_notify_chat();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "internal_chat_message_reactions");

            migrationBuilder.DropTable(
                name: "internal_chat_message_receipts");
        }
    }
}
