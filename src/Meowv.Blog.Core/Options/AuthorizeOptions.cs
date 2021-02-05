using Meowv.Blog.Options.Authorize;

namespace Meowv.Blog.Options
{
    public class AuthorizeOptions
    {
        /// <summary>
        /// Github
        /// </summary>
        public GithubOptions Github { get; set; }

        /// <summary>
        /// Gitee
        /// </summary>
        public GiteeOptions Gitee { get; set; }

        /// <summary>
        /// Alipay
        /// </summary>
        public AlipayOptions Alipay { get; set; }

        /// <summary>
        /// Dingtalk
        /// </summary>
        public DingtalkOptions Dingtalk { get; set; }

        /// <summary>
        /// Microsoft
        /// </summary>
        public MicrosoftOptions Microsoft { get; set; }

        /// <summary>
        /// Weibo
        /// </summary>
        public WeiboOptions Weibo { get; set; }

        /// <summary>
        /// QQ
        /// </summary>
        public QQOptions QQ { get; set; }
    }
}