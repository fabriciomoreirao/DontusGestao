using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Dontus.Operations.Infrastructure.Migrations;

[DbContext(typeof(OperationsDbContext))]
[Migration("20261118120000_SessionAuthorizationSnapshot")]
public sealed class SessionAuthorizationSnapshot : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.AddColumn<string>(
        name: "AuthorizationJson", table: "local_auth_sessions", type: "text", nullable: false, defaultValue: "");

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropColumn(
        name: "AuthorizationJson", table: "local_auth_sessions");
}
