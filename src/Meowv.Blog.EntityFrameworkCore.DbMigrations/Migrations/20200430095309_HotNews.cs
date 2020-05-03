using System;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Meowv.Blog.EntityFrameworkCore.DbMigrations.Migrations
{
    public partial class HotNews : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "meowv_HotNews",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    Title = table.Column<string>(maxLength: 200, nullable: false),
                    Url = table.Column<string>(maxLength: 250, nullable: false),
                    SourceId = table.Column<int>(type: "int", nullable: false),
                    CreateTime = table.Column<DateTime>(type: "datetime", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_meowv_HotNews", x => x.Id);
                });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "meowv_HotNews");
        }
    }
}
