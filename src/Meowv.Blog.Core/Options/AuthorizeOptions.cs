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
    }
}