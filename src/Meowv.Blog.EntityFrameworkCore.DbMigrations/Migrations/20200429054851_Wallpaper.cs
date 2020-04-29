using System;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Meowv.Blog.EntityFrameworkCore.DbMigrations.Migrations
{
    public partial class Wallpaper : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "CreateTIme",
                table: "meowv_Signatures",
                newName: "CreateTime");

            migrationBuilder.CreateTable(
                name: "meowv_Wallpapers",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    Url = table.Column<string>(maxLength: 200, nullable: false),
                    Title = table.Column<string>(maxLength: 100, nullable: false),
                    Type = table.Column<int>(type: "int", nullable: false),
                    CreateTime = table.Column<DateTime>(type: "datetime", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_meowv_Wallpapers", x => x.Id);
                });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "meowv_Wallpapers");

            migrationBuilder.RenameColumn(
                name: "CreateTime",
                table: "meowv_Signatures",
                newName: "CreateTIme");
        }
    }
}
