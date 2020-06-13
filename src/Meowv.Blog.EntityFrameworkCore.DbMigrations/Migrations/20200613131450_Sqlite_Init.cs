using System;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Meowv.Blog.EntityFrameworkCore.DbMigrations.Migrations
{
    public partial class Sqlite_Init : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Url",
                table: "meowv_Wallpapers",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(200) CHARACTER SET utf8mb4",
                oldMaxLength: 200);

            migrationBuilder.AlterColumn<string>(
                name: "Title",
                table: "meowv_Wallpapers",
                maxLength: 100,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(100) CHARACTER SET utf8mb4",
                oldMaxLength: 100);

            migrationBuilder.AlterColumn<Guid>(
                name: "Id",
                table: "meowv_Wallpapers",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "char(36)");

            migrationBuilder.AlterColumn<string>(
                name: "TagName",
                table: "meowv_Tags",
                maxLength: 50,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(50) CHARACTER SET utf8mb4",
                oldMaxLength: 50);

            migrationBuilder.AlterColumn<string>(
                name: "DisplayName",
                table: "meowv_Tags",
                maxLength: 50,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(50) CHARACTER SET utf8mb4",
                oldMaxLength: 50);

            migrationBuilder.AlterColumn<int>(
                name: "Id",
                table: "meowv_Tags",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int")
                .Annotation("Sqlite:Autoincrement", true)
                .OldAnnotation("Sqlite:Autoincrement", true);

            migrationBuilder.AlterColumn<string>(
                name: "Url",
                table: "meowv_Posts",
                maxLength: 100,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(100) CHARACTER SET utf8mb4",
                oldMaxLength: 100);

            migrationBuilder.AlterColumn<string>(
                name: "Title",
                table: "meowv_Posts",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(200) CHARACTER SET utf8mb4",
                oldMaxLength: 200);

            migrationBuilder.AlterColumn<string>(
                name: "Author",
                table: "meowv_Posts",
                maxLength: 10,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "varchar(10) CHARACTER SET utf8mb4",
                oldMaxLength: 10,
                oldNullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "Id",
                table: "meowv_Posts",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int")
                .Annotation("Sqlite:Autoincrement", true)
                .OldAnnotation("Sqlite:Autoincrement", true);

            migrationBuilder.AlterColumn<int>(
                name: "Id",
                table: "meowv_Post_Tags",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int")
                .Annotation("Sqlite:Autoincrement", true)
                .OldAnnotation("Sqlite:Autoincrement", true);

            migrationBuilder.AlterColumn<string>(
                name: "Url",
                table: "meowv_HotNews",
                maxLength: 250,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(250) CHARACTER SET utf8mb4",
                oldMaxLength: 250);

            migrationBuilder.AlterColumn<string>(
                name: "Title",
                table: "meowv_HotNews",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(200) CHARACTER SET utf8mb4",
                oldMaxLength: 200);

            migrationBuilder.AlterColumn<Guid>(
                name: "Id",
                table: "meowv_HotNews",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "char(36)");

            migrationBuilder.AlterColumn<string>(
                name: "Title",
                table: "meowv_Friendlinks",
                maxLength: 20,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(20) CHARACTER SET utf8mb4",
                oldMaxLength: 20);

            migrationBuilder.AlterColumn<string>(
                name: "LinkUrl",
                table: "meowv_Friendlinks",
                maxLength: 100,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(100) CHARACTER SET utf8mb4",
                oldMaxLength: 100);

            migrationBuilder.AlterColumn<int>(
                name: "Id",
                table: "meowv_Friendlinks",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int")
                .Annotation("Sqlite:Autoincrement", true)
                .OldAnnotation("Sqlite:Autoincrement", true);

            migrationBuilder.AlterColumn<string>(
                name: "DisplayName",
                table: "meowv_Categories",
                maxLength: 50,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(50) CHARACTER SET utf8mb4",
                oldMaxLength: 50);

            migrationBuilder.AlterColumn<string>(
                name: "CategoryName",
                table: "meowv_Categories",
                maxLength: 50,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(50) CHARACTER SET utf8mb4",
                oldMaxLength: 50);

            migrationBuilder.AlterColumn<int>(
                name: "Id",
                table: "meowv_Categories",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int")
                .Annotation("Sqlite:Autoincrement", true)
                .OldAnnotation("Sqlite:Autoincrement", true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Url",
                table: "meowv_Wallpapers",
                type: "varchar(200) CHARACTER SET utf8mb4",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldMaxLength: 200);

            migrationBuilder.AlterColumn<string>(
                name: "Title",
                table: "meowv_Wallpapers",
                type: "varchar(100) CHARACTER SET utf8mb4",
                maxLength: 100,
                nullable: false,
                oldClrType: typeof(string),
                oldMaxLength: 100);

            migrationBuilder.AlterColumn<Guid>(
                name: "Id",
                table: "meowv_Wallpapers",
                type: "char(36)",
                nullable: false,
                oldClrType: typeof(Guid));

            migrationBuilder.AlterColumn<string>(
                name: "TagName",
                table: "meowv_Tags",
                type: "varchar(50) CHARACTER SET utf8mb4",
                maxLength: 50,
                nullable: false,
                oldClrType: typeof(string),
                oldMaxLength: 50);

            migrationBuilder.AlterColumn<string>(
                name: "DisplayName",
                table: "meowv_Tags",
                type: "varchar(50) CHARACTER SET utf8mb4",
                maxLength: 50,
                nullable: false,
                oldClrType: typeof(string),
                oldMaxLength: 50);

            migrationBuilder.AlterColumn<int>(
                name: "Id",
                table: "meowv_Tags",
                type: "int",
                nullable: false,
                oldClrType: typeof(int))
                .Annotation("Sqlite:Autoincrement", true)
                .OldAnnotation("Sqlite:Autoincrement", true);

            migrationBuilder.AlterColumn<string>(
                name: "Url",
                table: "meowv_Posts",
                type: "varchar(100) CHARACTER SET utf8mb4",
                maxLength: 100,
                nullable: false,
                oldClrType: typeof(string),
                oldMaxLength: 100);

            migrationBuilder.AlterColumn<string>(
                name: "Title",
                table: "meowv_Posts",
                type: "varchar(200) CHARACTER SET utf8mb4",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldMaxLength: 200);

            migrationBuilder.AlterColumn<string>(
                name: "Author",
                table: "meowv_Posts",
                type: "varchar(10) CHARACTER SET utf8mb4",
                maxLength: 10,
                nullable: true,
                oldClrType: typeof(string),
                oldMaxLength: 10,
                oldNullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "Id",
                table: "meowv_Posts",
                type: "int",
                nullable: false,
                oldClrType: typeof(int))
                .Annotation("Sqlite:Autoincrement", true)
                .OldAnnotation("Sqlite:Autoincrement", true);

            migrationBuilder.AlterColumn<int>(
                name: "Id",
                table: "meowv_Post_Tags",
                type: "int",
                nullable: false,
                oldClrType: typeof(int))
                .Annotation("Sqlite:Autoincrement", true)
                .OldAnnotation("Sqlite:Autoincrement", true);

            migrationBuilder.AlterColumn<string>(
                name: "Url",
                table: "meowv_HotNews",
                type: "varchar(250) CHARACTER SET utf8mb4",
                maxLength: 250,
                nullable: false,
                oldClrType: typeof(string),
                oldMaxLength: 250);

            migrationBuilder.AlterColumn<string>(
                name: "Title",
                table: "meowv_HotNews",
                type: "varchar(200) CHARACTER SET utf8mb4",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldMaxLength: 200);

            migrationBuilder.AlterColumn<Guid>(
                name: "Id",
                table: "meowv_HotNews",
                type: "char(36)",
                nullable: false,
                oldClrType: typeof(Guid));

            migrationBuilder.AlterColumn<string>(
                name: "Title",
                table: "meowv_Friendlinks",
                type: "varchar(20) CHARACTER SET utf8mb4",
                maxLength: 20,
                nullable: false,
                oldClrType: typeof(string),
                oldMaxLength: 20);

            migrationBuilder.AlterColumn<string>(
                name: "LinkUrl",
                table: "meowv_Friendlinks",
                type: "varchar(100) CHARACTER SET utf8mb4",
                maxLength: 100,
                nullable: false,
                oldClrType: typeof(string),
                oldMaxLength: 100);

            migrationBuilder.AlterColumn<int>(
                name: "Id",
                table: "meowv_Friendlinks",
                type: "int",
                nullable: false,
                oldClrType: typeof(int))
                .Annotation("Sqlite:Autoincrement", true)
                .OldAnnotation("Sqlite:Autoincrement", true);

            migrationBuilder.AlterColumn<string>(
                name: "DisplayName",
                table: "meowv_Categories",
                type: "varchar(50) CHARACTER SET utf8mb4",
                maxLength: 50,
                nullable: false,
                oldClrType: typeof(string),
                oldMaxLength: 50);

            migrationBuilder.AlterColumn<string>(
                name: "CategoryName",
                table: "meowv_Categories",
                type: "varchar(50) CHARACTER SET utf8mb4",
                maxLength: 50,
                nullable: false,
                oldClrType: typeof(string),
                oldMaxLength: 50);

            migrationBuilder.AlterColumn<int>(
                name: "Id",
                table: "meowv_Categories",
                type: "int",
                nullable: false,
                oldClrType: typeof(int))
                .Annotation("Sqlite:Autoincrement", true)
                .OldAnnotation("Sqlite:Autoincrement", true);
        }
    }
}
