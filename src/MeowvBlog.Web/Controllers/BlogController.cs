using MeowvBlog.Services.Blog;
using MeowvBlog.Services.Dto;
using MeowvBlog.Services.Dto.Blog;
using Microsoft.AspNetCore.Mvc;
using Plus;
using Plus.Services.Dto;
using Plus.WebApi;
using System.Threading.Tasks;

namespace MeowvBlog.Web.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class BlogController : ControllerBase
    {
        private readonly IBlogService _blogService;

        public BlogController()
        {
            _blogService = PlusEngine.Instance.Resolve<IBlogService>();
        }

        /// <summary>
        /// 新增文章
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPost]
        public async Task<Response<string>> InsertPost([FromBody] PostDto dto)
        {
            var response = new Response<string>();

            var result = await _blogService.InsertPost(dto);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 删除文章
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [HttpDelete]
        public async Task<Response<string>> DeletePost(int id)
        {
            var response = new Response<string>();

            var result = await _blogService.DeletePost(id);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 更新文章
        /// </summary>
        /// <param name="id"></param>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPut]
        public async Task<Response<string>> UpdatePost(int id, [FromBody] PostDto dto)
        {
            var response = new Response<string>();

            var result = await _blogService.UpdatePost(id, dto);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 获取文章
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        [HttpGet]
        public async Task<Response<GetPostDto>> GetPost(string url)
        {
            var response = new Response<GetPostDto>();

            var result = await _blogService.GetPost(url);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 分页查询文章列表
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("query")]
        public async Task<Response<PagedResultDto<QueryPostDto>>> QueryPost([FromQuery] PagingInput input)
        {
            var response = new Response<PagedResultDto<QueryPostDto>>
            {
                Result = await _blogService.QueryPost(input)
            };
            return response;
        }
    }
}