using System;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Meowv.Blog.EntityFrameworkCore.DbMigrations.Migrations
{
    public partial class Signature : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "meowv_Signatures",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    Name = table.Column<string>(maxLength: 20, nullable: false),
                    Type = table.Column<string>(maxLength: 20, nullable: false),
                    Url = table.Column<string>(maxLength: 100, nullable: false),
                    Ip = table.Column<string>(maxLength: 50, nullable: false),
                    CreateTIme = table.Column<DateTime>(type: "datetime", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_meowv_Signatures", x => x.Id);
                });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "meowv_Signatures");
        }
    }
}
