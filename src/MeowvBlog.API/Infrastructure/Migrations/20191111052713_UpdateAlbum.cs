using Microsoft.EntityFrameworkCore.Migrations;

namespace MeowvBlog.API.Infrastructure.Migrations
{
    public partial class UpdateAlbum : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsPublic",
                table: "Albums",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Password",
                table: "Albums",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsPublic",
                table: "Albums");

            migrationBuilder.DropColumn(
                name: "Password",
                table: "Albums");
        }
    }
}
