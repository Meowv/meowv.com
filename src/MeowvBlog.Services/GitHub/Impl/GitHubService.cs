using MeowvBlog.Authorization.GitHub;
using Plus.Services;
using System;
using System.Threading.Tasks;

namespace MeowvBlog.Services.GitHub.Impl
{
    public class GitHubService : ApplicationServiceBase, IGitHubService
    {
        /// <summary>
        /// 获取GitHub授权地址
        /// </summary>
        /// <param name="request"></param>
        /// <returns></returns>
        public async Task<string> GetGitHubUrl()
        {
            var request = new AuthorizeRequest();

            var url = string.Concat(new string[]
            {
                GitHubConfig.API_Authorize,
                "?client_id=",
                request.Client_ID,
                "&scope=",
                request.Scope.UrlEncode(),
                "&state=",
                request.State,
                "&redirect_uri=",
                request.Redirect_Uri.UrlEncode()
            });
            return await Task.FromResult(url);
        }

        /// <summary>
        /// 获取 access token
        /// </summary>
        /// <returns></returns>
        public async Task<string> GetAccessToken(string code)
        {
            var request = new AccessTokenRequest();

            var pars = string.Concat(new string[]
            {
                "code=",
                code,
                "&client_id=",
                request.Client_ID,
                "&redirect_uri=",
                request.Redirect_Uri,
                "&client_secret=",
                request.Client_Secret
            });

            var hwr = GitHubConfig.API_AccessToken.HWRequest("POST", pars);
            hwr.Accept = "application/json";

            var result = hwr.HWRequestResult();

            return await Task.FromResult(result);
        }

        /// <summary>
        /// 根据access_token获取用户信息
        /// </summary>
        /// <param name="token"></param>
        /// <returns></returns>
        public async Task<string> GetUserResult(string token)
        {
            try
            {
                var url = $"{GitHubConfig.API_User}?access_token={token}";
               
                var hwr = url.HWRequest();
                hwr.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.142 Safari/537.36";

                string result = hwr.HWRequestResult();

                return await Task.FromResult(result);
            }
            catch (Exception e)
            {
                return await Task.FromResult(e.Message);
            }
        }
    }
}