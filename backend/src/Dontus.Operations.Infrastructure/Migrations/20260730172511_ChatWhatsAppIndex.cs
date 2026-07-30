using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ChatWhatsAppIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_chat_whatsapp_numbers_PhoneNumberId",
                table: "chat_whatsapp_numbers");

            migrationBuilder.CreateIndex(
                name: "IX_chat_whatsapp_numbers_PhoneNumberId",
                table: "chat_whatsapp_numbers",
                column: "PhoneNumberId",
                unique: true,
                filter: "\"PhoneNumberId\" <> ''");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_chat_whatsapp_numbers_PhoneNumberId",
                table: "chat_whatsapp_numbers");

            migrationBuilder.CreateIndex(
                name: "IX_chat_whatsapp_numbers_PhoneNumberId",
                table: "chat_whatsapp_numbers",
                column: "PhoneNumberId",
                unique: true);
        }
    }
}
