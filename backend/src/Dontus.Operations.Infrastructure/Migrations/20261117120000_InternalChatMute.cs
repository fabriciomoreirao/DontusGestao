using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
namespace Dontus.Operations.Infrastructure.Migrations;
[DbContext(typeof(OperationsDbContext))]
[Migration("20261117120000_InternalChatMute")]
public sealed class InternalChatMute : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.AddColumn<bool>(name: "IsMuted", table: "internal_chat_room_members", type: "boolean", nullable: false, defaultValue: false);
    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropColumn(name: "IsMuted", table: "internal_chat_room_members");
}
