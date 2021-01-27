namespace Meowv.Blog.Dto.Users
{
    public class UserDto
    {
        public string Id { get; set; }

        public string Username { get; set; }

        public string Type { get; set; }

        public string Identity { get; set; }

        public string Name { get; set; }

        public string Avatar { get; set; }

        public string Email { get; set; }

        public bool IsAdmin { get; set; }

        public string CreatedAt { get; set; }
    }
}