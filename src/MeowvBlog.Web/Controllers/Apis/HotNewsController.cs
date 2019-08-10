using MeowvBlog.Services.Dto.HotNews;
using MeowvBlog.Services.HotNews;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plus;
using Plus.WebApi;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Web.Controllers.Apis
{
    [Route("api/[controller]")]
    [AllowAnonymous]
    [ApiController]
    public class HotNewsController : ControllerBase
    {
        private readonly IHotNewsService _hotNewsService;

        public HotNewsController()
        {
            _hotNewsService = PlusEngine.Instance.Resolve<IHotNewsService>();
        }

        /// <summary>
        /// 批量添加热榜
        /// </summary>
        /// <param name="dtos"></param>
        /// <returns></returns>
        [HttpPost]
        [ApiExplorerSettings(IgnoreApi = true)]
        public async Task<Response<string>> BulkInsertHotNews(IList<InsertHotNewsInput> dtos)
        {
            var response = new Response<string>();

            string spider = HttpContext.Request.Headers["spider"];
            if (spider != "python")
            {
                response.SetMessage(ResponseStatusCode.Unauthorized);
                return response;
            }
            var result = await _hotNewsService.BulkInsertHotNews(dtos);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 获取所有HotNews的类型
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("source")]
        [ResponseCache(CacheProfileName = "default", Duration = 600)]
        public async Task<IList<NameValue<int>>> GetSourceId()
        {
            return await _hotNewsService.GetSourceId();
        }

        /// <summary>
        /// 根据sourceId获取对于HotNews
        /// </summary>
        /// <param name="sourceId"></param>
        /// <returns></returns>
        [HttpGet]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "sourceId" })]
        public async Task<Response<IList<HotNewsDto>>> GetHotNews(int sourceId)
        {
            var response = new Response<IList<HotNewsDto>>
            {
                Result = await _hotNewsService.GetHotNews(sourceId)
            };
            return response;
        }
    }
}