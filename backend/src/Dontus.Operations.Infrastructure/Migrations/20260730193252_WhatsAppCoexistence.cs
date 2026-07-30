using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class WhatsAppCoexistence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CoexistenceCompletedAt",
                table: "chat_whatsapp_numbers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoexistenceError",
                table: "chat_whatsapp_numbers",
                type: "character varying(1600)",
                maxLength: 1600,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CoexistenceStatus",
                table: "chat_whatsapp_numbers",
                type: "character varying(60)",
                maxLength: 60,
                nullable: false,
                defaultValue: "Não se aplica");

            migrationBuilder.AddColumn<string>(
                name: "ConnectionMode",
                table: "chat_whatsapp_numbers",
                type: "character varying(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "CloudApi");

            migrationBuilder.AddColumn<string>(
                name: "EmbeddedSignupConfigId",
                table: "chat_whatsapp_numbers",
                type: "character varying(160)",
                maxLength: 160,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "MetaAppId",
                table: "chat_whatsapp_numbers",
                type: "character varying(120)",
                maxLength: 120,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CoexistenceCompletedAt",
                table: "chat_whatsapp_numbers");

            migrationBuilder.DropColumn(
                name: "CoexistenceError",
                table: "chat_whatsapp_numbers");

            migrationBuilder.DropColumn(
                name: "CoexistenceStatus",
                table: "chat_whatsapp_numbers");

            migrationBuilder.DropColumn(
                name: "ConnectionMode",
                table: "chat_whatsapp_numbers");

            migrationBuilder.DropColumn(
                name: "EmbeddedSignupConfigId",
                table: "chat_whatsapp_numbers");

            migrationBuilder.DropColumn(
                name: "MetaAppId",
                table: "chat_whatsapp_numbers");
        }
    }
}
