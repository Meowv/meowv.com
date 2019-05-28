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
        /// test
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("Get")]
        public async Task<Response<PostDto>> Get(int id)
        {
            var response = new Response<PostDto>();
            response.Result = await _blogService.Get(id);
            return response;
        }
    }
}