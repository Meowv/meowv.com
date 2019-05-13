using MeowvBlog.Core.Dependency;
using MeowvBlog.Dtos.Post;
using MeowvBlog.IServices.Post;
using MeowvBlog.Response;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;
using System.Threading.Tasks;

namespace MeowvBlog.Web.WebApi
{
    [Route("api/post")]
    [ApiController]
    public class PostController : ControllerBase
    {
        private readonly IPostService _postService;

        public PostController()
        {
            _postService = IocManager.Instance.Resolve<IPostService>();
        }

        [HttpGet]
        [Route("Get")]
        public async Task<Response<PostDto>> Get([Required] int id)
        {
            var response = new Response<PostDto>();

            var result = await _postService.GetAsync(id);
            if (!result.Success)
            {
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            }
            else
            {
                response.Result = result.Result;
            }

            return response;
        }
    }
}