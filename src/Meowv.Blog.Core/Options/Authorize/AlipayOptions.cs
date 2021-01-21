namespace Meowv.Blog.Options.Authorize
{
    public class AlipayOptions
    {
        public string AppId { get; set; }

        public string RedirectUrl { get; set; }

        public string Scope { get; set; }

        public string PrivateKey { get; set; }

        public string PublicKey { get; set; }

        public string AuthorizeUrl = "https://openauth.alipay.com/oauth2/publicAppAuthorize.htm";

        public string AccessTokenUrl = "https://openapi.alipay.com/gateway.do";

        public string UserInfoUrl = "https://openapi.alipay.com/gateway.do";
    }
}