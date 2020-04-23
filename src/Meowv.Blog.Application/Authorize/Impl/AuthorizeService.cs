using Meowv.Blog.Domain.Configurations;
using Meowv.Blog.ToolKits.Base;
using Meowv.Blog.ToolKits.GitHub;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Authorize.Impl
{
    public class AuthorizeService : MeowvBlogApplicationServiceBase, IAuthorizeService
    {
        private readonly IHttpClientFactory _httpClient;

        public AuthorizeService(IHttpClientFactory httpClient)
        {
            _httpClient = httpClient;
        }

        /// <summary>
        /// 获取登录地址(GitHub)
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<string>> GetLoginAddressAsync()
        {
            var result = new ServiceResult<string>();

            var request = new AuthorizeRequest();
            var address = string.Concat(new string[]
            {
                GitHubConfig.API_Authorize,
                "?client_id=", request.Client_ID,
                "&scope=", request.Scope,
                "&state=", request.State,
                "&redirect_uri=", request.Redirect_Uri
            });

            result.IsSuccess(address);
            return await Task.FromResult(result);
        }
    }
}