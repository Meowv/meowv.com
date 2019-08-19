using MeowvBlog.Services.Commits;
using MeowvBlog.Services.Dto;
using MeowvBlog.Services.Dto.Commits;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plus;
using Plus.Services.Dto;
using Plus.WebApi;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Net.Http;
using System.Threading.Tasks;

namespace MeowvBlog.Web.Controllers.Apis
{
    [Route("api/[controller]")]
    [ApiController]
    public class CommitsController : ControllerBase
    {
        private readonly ICommitService _commitService;
        private readonly IHttpClientFactory _httpClientFactory;

        public CommitsController(IHttpClientFactory httpClientFactory)
        {
            _commitService = PlusEngine.Instance.Resolve<ICommitService>();
            _httpClientFactory = httpClientFactory;
        }

        /// <summary>
        /// 同步GitHub Commit记录
        /// </summary>
        /// <param name="page"></param>
        /// <returns></returns>
        [HttpGet]
        [Authorize]
        [Route("sync")]
        public async Task<Response<string>> SyncCommitData([Range(1, int.MaxValue)] int page)
        {
            var api = $"https://api.github.com/repos/Meowv/Blog/commits?page={page}";

            var list = new List<CommitDto>();

            using (var client = _httpClientFactory.CreateClient())
            {
                client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/76.0.3809.100 Safari/537.36");
                var json = await client.GetStringAsync(api);

                List<dynamic> obj = json.DeserializeFromJson<List<dynamic>>();
                foreach (var item in obj)
                {
                    var dto = new CommitDto
                    {
                        Sha = item["sha"],
                        Message = item["commit"]["message"],
                        Date = (string)item["commit"]["author"]["date"]
                    };
                    list.Add(dto);
                }
            }

            var response = new Response<string>();

            var result = await _commitService.BulkInsertCommits(list);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 分页查询Commit记录
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("query")]
        [AllowAnonymous]
        [ResponseCache(CacheProfileName = "default", Duration = 600, VaryByQueryKeys = new string[] { "page", "limit" })]
        public async Task<Response<PagedResultDto<CommitDto>>> QueryNicceArticle([FromQuery] PagingInput input)
        {
            var response = new Response<PagedResultDto<CommitDto>>
            {
                Result = await _commitService.QueryCommits(input)
            };
            return response;
        }
    }
}