namespace Meowv.Blog.Admin.Models.Users
{
    public class LoginModel
    {
        public string Type { get; set; } = "account";

        public string Username { get; set; }

        public string Password { get; set; }

        public string Code { get; set; }
    }
}