using System.Threading.Tasks;

namespace MeowvBlog.Services.GitHub
{
    public interface IGitHubService
    {
        /// <summary>
        /// 获取GitHub授权地址
        /// </summary>
        /// <returns></returns>
        Task<string> GetGitHubUrl();

        /// <summary>
        /// 获取access_token
        /// </summary>
        /// <param name="code"></param>
        /// <returns></returns>
        Task<string> GetAccessToken(string code);

        /// <summary>
        /// 根据access_token获取用户信息
        /// </summary>
        /// <param name="token"></param>
        /// <returns></returns>
        Task<string> GetUserResult(string token);
    }
}