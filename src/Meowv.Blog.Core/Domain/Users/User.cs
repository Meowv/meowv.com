using System;

namespace Meowv.Blog.Domain.Users
{
    public class User : EntityBase
    {
        public string Username { get; set; }

        public string Password { get; set; }

        public string Type { get; set; }

        public string Identity { get; set; }

        public string Name { get; set; }

        public string Avatar { get; set; }

        public string Email { get; set; }

        public bool IsAdmin { get; set; } = false;

        public DateTime CreatedAt { get; set; } = DateTime.Now;
    }
}