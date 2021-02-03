namespace Meowv.Blog.Options.Authorize
{
    public class WeiboOptions
    {
        public string ClientId { get; set; }

        public string ClientSecret { get; set; }

        public string RedirectUrl { get; set; }

        public string Scope { get; set; }

        public string AuthorizeUrl = "https://api.weibo.com/oauth2/authorize";

        public string AccessTokenUrl = "https://api.weibo.com/oauth2/access_token";

        public string UserInfoUrl = "https://api.weibo.com/2/users/show.json";
    }
}