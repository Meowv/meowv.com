namespace MeowvBlog.API.Configurations
{
    public class GitHubConfig
    {
        /// <summary>
        /// GET请求，跳转GitHub登录界面，获取用户授权，得到code
        /// </summary>
        public static string API_Authorize = "https://github.com/login/oauth/authorize";

        /// <summary>
        /// POST请求，根据code得到access_token
        /// </summary>
        public static string API_AccessToken = "https://github.com/login/oauth/access_token";

        /// <summary>
        /// GET请求，根据access_token得到用户信息
        /// </summary>
        public static string API_User = "https://api.github.com/user";

        /// <summary>
        /// Github ID
        /// </summary>
        public static int Id => AppSettings.GitHub.Id;

        /// <summary>
        /// Client ID
        /// </summary>
        public static string Client_ID = AppSettings.GitHub.Client_ID;

        /// <summary>
        /// Client Secret
        /// </summary>
        public static string Client_Secret = AppSettings.GitHub.Client_Secret;

        /// <summary>
        /// Authorization callback URL
        /// </summary>
        public static string Redirect_Uri = AppSettings.GitHub.Redirect_Uri;

        /// <summary>
        /// Application name
        /// </summary>
        public static string ApplicationName = AppSettings.GitHub.ApplicationName;
    }
}