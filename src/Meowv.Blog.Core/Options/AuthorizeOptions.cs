using Meowv.Blog.Options.Authorize;

namespace Meowv.Blog.Options
{
    public class AuthorizeOptions
    {
        /// <summary>
        /// Account
        /// </summary>
        public AccountOptions Account { get; set; }

        /// <summary>
        /// Github
        /// </summary>
        public GithubOptions Github { get; set; }
    }
}