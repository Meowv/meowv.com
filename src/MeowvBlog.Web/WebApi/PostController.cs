using MeowvBlog.Dtos.Post;
using MeowvBlog.Response;
using MeowvBlog.Services.Post;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;
using System.Threading.Tasks;

namespace MeowvBlog.Web.WebApi
{
    [Route("api/post")]
    [ApiController]
    public class PostController : ControllerBase
    {
        //private readonly PostService _postService;

        //public PostController(PostService postService)
        //{
        //    _postService = postService;
        //}

        [HttpGet]
        public string Get(int id)
        {
            return "value";
        }

        //[HttpGet]
        //[Route("Get")]
        //public async Task<Response<PostDto>> Get([Required] int id)
        //{
        //    var response = new Response<PostDto>();

        //    var result = await _postService.GetAsync(id);
        //    if (!result.Success)
        //    {
        //        response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
        //    }
        //    else
        //    {
        //        response.Result = result.Result;
        //    }

        //    return response;
        //}
    }
}