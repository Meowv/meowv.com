using MeowvBlog.API.Configurations;

namespace MeowvBlog.API.Models.Entity.GitHub
{
    /// <summary>
    /// AccessTokenRequest
    /// </summary>
    public class AccessTokenRequest
    {
        /// <summary>
        /// Client ID
        /// </summary>
        public string Client_ID = GitHubConfig.Client_ID;

        /// <summary>
        /// Client Secret
        /// </summary>
        public string Client_Secret = GitHubConfig.Client_Secret;

        /// <summary>
        /// 调用API_Authorize获取到的Code值
        /// </summary>
        public string Code { get; set; }

        /// <summary>
        /// Authorization callback URL
        /// </summary>
        public string Redirect_Uri = GitHubConfig.Redirect_Uri;

        /// <summary>
        /// State
        /// </summary>
        public string State { get; set; }
    }
}