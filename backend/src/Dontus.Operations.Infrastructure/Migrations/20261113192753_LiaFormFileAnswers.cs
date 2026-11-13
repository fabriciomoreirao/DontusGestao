using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class LiaFormFileAnswers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "lia_form_attachments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    QuestionId = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    FileName = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    StorageKey = table.Column<string>(type: "text", nullable: false),
                    Content = table.Column<byte[]>(type: "bytea", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_lia_form_attachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_lia_form_attachments_lia_form_requests_RequestId",
                        column: x => x.RequestId,
                        principalTable: "lia_form_requests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_lia_form_attachments_RequestId_QuestionId",
                table: "lia_form_attachments",
                columns: new[] { "RequestId", "QuestionId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "lia_form_attachments");
        }
    }
}
