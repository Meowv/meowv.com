using Meowv.Blog.Application.Contracts.Blog;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Blog
{
    public partial interface IBlogService
    {
        /// <summary>
        /// 获取全部文章
        /// </summary>
        /// <returns></returns>
        Task<List<PostDto>> GetAllAsync();
    }
}