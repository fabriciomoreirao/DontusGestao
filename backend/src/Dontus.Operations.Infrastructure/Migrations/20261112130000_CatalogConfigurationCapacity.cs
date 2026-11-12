using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Dontus.Operations.Infrastructure.Migrations;

[DbContext(typeof(OperationsDbContext))]
[Migration("20261112130000_CatalogConfigurationCapacity")]
public sealed class CatalogConfigurationCapacity : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.AlterColumn<string>(
        name:"Description",table:"customer_catalog_options",type:"text",nullable:false,
        oldClrType:typeof(string),oldType:"character varying(600)",oldMaxLength:600);

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.AlterColumn<string>(
        name:"Description",table:"customer_catalog_options",type:"character varying(600)",maxLength:600,nullable:false,
        oldClrType:typeof(string),oldType:"text");
}
