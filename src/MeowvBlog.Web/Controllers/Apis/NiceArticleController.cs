using MeowvBlog.Services.Dto;
using MeowvBlog.Services.Dto.NiceArticle;
using MeowvBlog.Services.NiceArticle;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plus;
using Plus.Services.Dto;
using Plus.WebApi;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Web.Controllers.Apis
{
    [Route("api/[controller]")]
    [ApiController]
    public class NiceArticleController : ControllerBase
    {
        private readonly INiceArticleService _niceArticleService;

        public NiceArticleController()
        {
            _niceArticleService = PlusEngine.Instance.Resolve<INiceArticleService>();
        }

        /// <summary>
        /// 批量新增好文
        /// </summary>
        /// <param name="dtos"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("bulkInsert")]
        public async Task<Response<string>> BulkInsertNiceArticle([FromBody] IList<NiceArticleDto> dtos)
        {
            var response = new Response<string>();

            var result = await _niceArticleService.BulkInsertNiceArticle(dtos);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 新增好文
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("insert")]
        public async Task<Response<string>> InsertNiceArticle([FromBody] NiceArticleDto dto)
        {
            var response = new Response<string>();

            var result = await _niceArticleService.InsertNiceArticle(dto);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 分页查询好文
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("query")]
        [AllowAnonymous]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "page", "limit" })]
        public async Task<Response<PagedResultDto<QueryNiceArticleDto>>> QueryNicceArticle([FromQuery] PagingInput input)
        {
            var response = new Response<PagedResultDto<QueryNiceArticleDto>>
            {
                Result = await _niceArticleService.QueryNicceArticle(input)
            };
            return response;
        }
    }
}