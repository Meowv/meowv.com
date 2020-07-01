using Microsoft.EntityFrameworkCore.Migrations;
using System;

namespace Meowv.Blog.EntityFrameworkCore.DbMigrations.Migrations
{
    public partial class Initialization : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "meowv_Albums",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    Name = table.Column<string>(maxLength: 100, nullable: false),
                    ImgUrl = table.Column<string>(maxLength: 200, nullable: false),
                    IsPublic = table.Column<bool>(type: "bool", nullable: false),
                    Password = table.Column<string>(maxLength: 20, nullable: false),
                    CreateTime = table.Column<DateTime>(type: "datetime", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_meowv_Albums", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "meowv_Categories",
                columns: table => new
                {
                    Id = table.Column<int>(nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    CategoryName = table.Column<string>(maxLength: 50, nullable: false),
                    DisplayName = table.Column<string>(maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_meowv_Categories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "meowv_ChickenSoups",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    Content = table.Column<string>(maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_meowv_ChickenSoups", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "meowv_Friendlinks",
                columns: table => new
                {
                    Id = table.Column<int>(nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Title = table.Column<string>(maxLength: 20, nullable: false),
                    LinkUrl = table.Column<string>(maxLength: 100, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_meowv_Friendlinks", x => x.Id);
                });

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

            migrationBuilder.CreateTable(
                name: "meowv_Images",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    AlbumId = table.Column<Guid>(type: "Guid", nullable: false),
                    ImgUrl = table.Column<string>(maxLength: 200, nullable: false),
                    Width = table.Column<int>(type: "int", nullable: false),
                    Height = table.Column<int>(type: "int", nullable: false),
                    CreateTime = table.Column<DateTime>(type: "datetime", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_meowv_Images", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "meowv_Post_Tags",
                columns: table => new
                {
                    Id = table.Column<int>(nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    PostId = table.Column<int>(type: "int", nullable: false),
                    TagId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_meowv_Post_Tags", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "meowv_Posts",
                columns: table => new
                {
                    Id = table.Column<int>(nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Title = table.Column<string>(maxLength: 200, nullable: false),
                    Author = table.Column<string>(maxLength: 10, nullable: true),
                    Url = table.Column<string>(maxLength: 100, nullable: false),
                    Html = table.Column<string>(type: "longtext", nullable: false),
                    Markdown = table.Column<string>(type: "longtext", nullable: false),
                    CategoryId = table.Column<int>(type: "int", nullable: false),
                    CreationTime = table.Column<DateTime>(type: "datetime", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_meowv_Posts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "meowv_Signatures",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    Name = table.Column<string>(maxLength: 20, nullable: false),
                    Type = table.Column<string>(maxLength: 20, nullable: false),
                    Url = table.Column<string>(maxLength: 100, nullable: false),
                    Ip = table.Column<string>(maxLength: 50, nullable: false),
                    CreateTime = table.Column<DateTime>(type: "datetime", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_meowv_Signatures", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "meowv_Tags",
                columns: table => new
                {
                    Id = table.Column<int>(nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    TagName = table.Column<string>(maxLength: 50, nullable: false),
                    DisplayName = table.Column<string>(maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_meowv_Tags", x => x.Id);
                });

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
                name: "meowv_Albums");

            migrationBuilder.DropTable(
                name: "meowv_Categories");

            migrationBuilder.DropTable(
                name: "meowv_ChickenSoups");

            migrationBuilder.DropTable(
                name: "meowv_Friendlinks");

            migrationBuilder.DropTable(
                name: "meowv_HotNews");

            migrationBuilder.DropTable(
                name: "meowv_Images");

            migrationBuilder.DropTable(
                name: "meowv_Post_Tags");

            migrationBuilder.DropTable(
                name: "meowv_Posts");

            migrationBuilder.DropTable(
                name: "meowv_Signatures");

            migrationBuilder.DropTable(
                name: "meowv_Tags");

            migrationBuilder.DropTable(
                name: "meowv_Wallpapers");
        }
    }
}
