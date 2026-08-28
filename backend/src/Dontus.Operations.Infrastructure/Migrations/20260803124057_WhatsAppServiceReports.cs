using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class WhatsAppServiceReports : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SatisfactionComment",
                table: "chat_conversations",
                type: "character varying(1600)",
                maxLength: 1600,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SatisfactionRespondedAt",
                table: "chat_conversations",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SatisfactionScore",
                table: "chat_conversations",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ClosingMessage",
                table: "chat_channels",
                type: "character varying(1200)",
                maxLength: 1200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "SendClosingMessage",
                table: "chat_channels",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SatisfactionComment",
                table: "chat_conversations");

            migrationBuilder.DropColumn(
                name: "SatisfactionRespondedAt",
                table: "chat_conversations");

            migrationBuilder.DropColumn(
                name: "SatisfactionScore",
                table: "chat_conversations");

            migrationBuilder.DropColumn(
                name: "ClosingMessage",
                table: "chat_channels");

            migrationBuilder.DropColumn(
                name: "SendClosingMessage",
                table: "chat_channels");
        }
    }
}
