using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InternalChatExperience : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PhotoDataUrl",
                table: "internal_chat_rooms",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ArchivedAt",
                table: "internal_chat_room_members",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastReadAt",
                table: "internal_chat_room_members",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PhotoDataUrl",
                table: "internal_chat_rooms");

            migrationBuilder.DropColumn(
                name: "ArchivedAt",
                table: "internal_chat_room_members");

            migrationBuilder.DropColumn(
                name: "LastReadAt",
                table: "internal_chat_room_members");
        }
    }
}
