using Meowv.Blog.Application.Blog;
using Meowv.Blog.Application.Contracts.Blog;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
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
        /// 总数
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("count")]
        public async Task<long> GetPostCountAsync()
        {
            return await _blogService.GetPostCountAsync();
        }

        /// <summary>
        /// 获取全部文章
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("all")]
        public async Task<List<PostDto>> GetAllAsync()
        {
            return await _blogService.GetAllAsync();
        }
    }
}