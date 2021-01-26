using System.ComponentModel.DataAnnotations;

namespace Meowv.Blog.Admin.Models
{
    public class LoginModel
    {
        [Required]
        public string Type { get; set; }

        [Required]
        public string Username { get; set; }

        [Required]
        public string Password { get; set; }

        [Required]
        public string Code { get; set; }
    }
}