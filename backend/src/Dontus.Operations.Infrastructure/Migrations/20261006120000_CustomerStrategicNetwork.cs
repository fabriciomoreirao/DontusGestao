using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations;

[DbContext(typeof(OperationsDbContext))]
[Migration("20261006120000_CustomerStrategicNetwork")]
public partial class CustomerStrategicNetwork : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(
            name: "StrategicNetworkId",
            table: "customers",
            type: "uuid",
            nullable: true);

        migrationBuilder.CreateIndex(
            name: "IX_customers_StrategicNetworkId",
            table: "customers",
            column: "StrategicNetworkId");

        migrationBuilder.AddForeignKey(
            name: "FK_customers_work_items_StrategicNetworkId",
            table: "customers",
            column: "StrategicNetworkId",
            principalTable: "work_items",
            principalColumn: "Id",
            onDelete: ReferentialAction.SetNull);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey(
            name: "FK_customers_work_items_StrategicNetworkId",
            table: "customers");

        migrationBuilder.DropIndex(
            name: "IX_customers_StrategicNetworkId",
            table: "customers");

        migrationBuilder.DropColumn(
            name: "StrategicNetworkId",
            table: "customers");
    }
}
