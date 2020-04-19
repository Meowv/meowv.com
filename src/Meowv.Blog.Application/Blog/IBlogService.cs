using Meowv.Blog.Application.Contracts.Blog;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Blog
{
    public interface IBlogService
    {
        /// <summary>
        /// 
        /// </summary>
        /// <returns></returns>
        Task<long> GetPostCountAsync();

        /// <summary>
        /// 获取全部文章
        /// </summary>
        /// <returns></returns>
        Task<List<PostDto>> GetAllAsync();
    }
}