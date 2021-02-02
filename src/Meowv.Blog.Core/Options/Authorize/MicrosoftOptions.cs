namespace Meowv.Blog.Options.Authorize
{
    public class MicrosoftOptions
    {
        public string ClientId { get; set; }

        public string ClientSecret { get; set; }

        public string RedirectUrl { get; set; }

        public string Scope { get; set; }

        public string AuthorizeUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";

        public string AccessTokenUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

        public string UserInfoUrl = "https://graph.microsoft.com/v1.0/me";
    }
}