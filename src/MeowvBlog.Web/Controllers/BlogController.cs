using MeowvBlog.Services.Blog;
using MeowvBlog.Services.Dto.Blog;
using Microsoft.AspNetCore.Mvc;
using Plus;
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
        public async Task<Response<string>> Insert([FromBody] PostDto dto)
        {
            var response = new Response<string>();

            var result = await _blogService.Insert(dto);
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
        public async Task<Response<string>> Delete(int id)
        {
            var response = new Response<string>();

            var result = await _blogService.Delete(id);
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
        public async Task<Response<string>> Update(int id, [FromBody] PostDto dto)
        {
            var response = new Response<string>();

            var result = await _blogService.Update(id, dto);
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
        public async Task<Response<GetPostDto>> Get(string url)
        {
            var response = new Response<GetPostDto>();

            var result = await _blogService.Get(url);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }
    }
}