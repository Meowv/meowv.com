using Meowv.Blog.Application.Caching.Authorize;
using Meowv.Blog.Domain.Configurations;
using Meowv.Blog.ToolKits.Base;
using Meowv.Blog.ToolKits.GitHub;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Authorize.Impl
{
    public class AuthorizeService : MeowvBlogApplicationServiceBase, IAuthorizeService
    {
        private readonly IAuthorizeCacheService _authorizeCacheService;
        private readonly IHttpClientFactory _httpClient;

        public AuthorizeService(
            IAuthorizeCacheService authorizeCacheService,
            IHttpClientFactory httpClient)
        {
            _authorizeCacheService = authorizeCacheService;
            _httpClient = httpClient;
        }

        /// <summary>
        /// 获取登录地址(GitHub)
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<string>> GetLoginAddressAsync()
        {
            return await _authorizeCacheService.GetLoginAddressAsync(async () =>
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
            });
        }
    }
}