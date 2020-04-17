using Meowv.Blog.Application.Blog;
using Microsoft.AspNetCore.Mvc;
using System.Threading.Tasks;
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

        /// <summary>
        /// 。。。
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("get")]
        public string Get()
        {
            return _blogService.Get();
        }

        /// <summary>
        /// 悳方
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("count")]
        public async Task<long> PostCount()
        {
            return await _blogService.PostCountAsync();
        }
    }
}