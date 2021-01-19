namespace Meowv.Blog.Options.Authorize
{
    public class GithubOptions
    {
        public string ClientId { get; set; }

        public string ClientSecret { get; set; }

        public string RedirectUrl { get; set; }

        public string Scope { get; set; }

        public string AuthorizeUrl = "https://github.com/login/oauth/authorize";

        public string AccessTokenUrl = "https://github.com/login/oauth/access_token";

        public string UserInfoUrl = "https://api.github.com/user";
    }
}