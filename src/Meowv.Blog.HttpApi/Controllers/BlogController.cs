using Meowv.Blog.Application.Blog;
using Microsoft.AspNetCore.Mvc;
using Volo.Abp.AspNetCore.Mvc;

namespace Meowv.Blog.HttpApi.Controllers
{
    [Route("api/blog")]
    public class BlogController : AbpController
    {
        private readonly IBlogService _blogService;
        public BlogController(IBlogService blogService)
        {
            _blogService = blogService;
        }

        [HttpGet]
        [Route("get")]
        public string Get()
        {
            return _blogService.Get();
        }
    }
}