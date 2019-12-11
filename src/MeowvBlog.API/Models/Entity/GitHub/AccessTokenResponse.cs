namespace MeowvBlog.API.Models.Entity.GitHub
{
    /// <summary>
    /// AccessTokenResponse
    /// </summary>
    public class AccessTokenResponse
    {
        /// <summary>
        /// access_token
        /// </summary>
        public string Access_token { get; set; }

        /// <summary>
        /// 类型
        /// </summary>
        public string Token_type { get; set; }

        /// <summary>
        /// 授权的信息
        /// </summary>
        public string Scope { get; set; }
    }
}