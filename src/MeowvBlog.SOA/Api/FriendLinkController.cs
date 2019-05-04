using MeowvBlog.Services.Dto.FriendLinks;
using MeowvBlog.Services.FriendLinks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Threading.Tasks;
using UPrime;
using UPrime.WebApi;

namespace MeowvBlog.SOA.Api
{
    /// <summary>
    /// 友情链接API
    /// </summary>
    [Route("FriendLink")]
    public class FriendLinkController : ApiControllerBase
    {
        private readonly IFriendLinkService _friendLinkService;

        public FriendLinkController()
        {
            _friendLinkService = UPrimeEngine.Instance.Resolve<IFriendLinkService>();
        }

        /// <summary>
        /// 获取友情链接列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("Get")]
        [AllowAnonymous]
        [ResponseCache(CacheProfileName = "Hourly")]
        public async Task<UPrimeResponse<IList<FriendLinkDto>>> Get()
        {
            var response = new UPrimeResponse<IList<FriendLinkDto>>();

            var result = await _friendLinkService.GetAsync();
            if (!result.Success)
                response.SetMessage(UPrimeResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;

            return response;
        }
    }
}