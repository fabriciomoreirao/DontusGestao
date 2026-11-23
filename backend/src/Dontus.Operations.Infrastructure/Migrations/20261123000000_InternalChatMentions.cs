using Microsoft.EntityFrameworkCore.Migrations;

namespace Dontus.Operations.Infrastructure.Migrations;

public sealed partial class InternalChatMentions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.AddColumn<string>(
        name: "MentionsJson", table: "internal_chat_messages", type: "text", nullable: false, defaultValue: "[]");

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropColumn(
        name: "MentionsJson", table: "internal_chat_messages");
}
