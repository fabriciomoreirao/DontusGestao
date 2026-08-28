using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class NoticeAudienceEventsAndReceipts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EventAt",
                table: "company_notices",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ImageDataUrl",
                table: "company_notices",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Kind",
                table: "company_notices",
                type: "character varying(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "Aviso");

            migrationBuilder.AddColumn<Guid>(
                name: "TargetUserId",
                table: "company_notices",
                type: "uuid",
                nullable: true);

            migrationBuilder.AlterColumn<DateTimeOffset>(
                name: "ReadAt",
                table: "company_notice_reads",
                type: "timestamp with time zone",
                nullable: true,
                oldClrType: typeof(DateTimeOffset),
                oldType: "timestamp with time zone");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ViewedAt",
                table: "company_notice_reads",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.Sql("UPDATE company_notice_reads SET \"ViewedAt\" = \"ReadAt\" WHERE \"ReadAt\" IS NOT NULL;");

            migrationBuilder.CreateIndex(
                name: "IX_company_notices_TargetUserId",
                table: "company_notices",
                column: "TargetUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_company_notices_users_TargetUserId",
                table: "company_notices",
                column: "TargetUserId",
                principalTable: "users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_company_notices_users_TargetUserId",
                table: "company_notices");

            migrationBuilder.DropIndex(
                name: "IX_company_notices_TargetUserId",
                table: "company_notices");

            migrationBuilder.DropColumn(
                name: "EventAt",
                table: "company_notices");

            migrationBuilder.DropColumn(
                name: "ImageDataUrl",
                table: "company_notices");

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "company_notices");

            migrationBuilder.DropColumn(
                name: "TargetUserId",
                table: "company_notices");

            migrationBuilder.DropColumn(
                name: "ViewedAt",
                table: "company_notice_reads");

            migrationBuilder.AlterColumn<DateTimeOffset>(
                name: "ReadAt",
                table: "company_notice_reads",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)),
                oldClrType: typeof(DateTimeOffset),
                oldType: "timestamp with time zone",
                oldNullable: true);
        }
    }
}
