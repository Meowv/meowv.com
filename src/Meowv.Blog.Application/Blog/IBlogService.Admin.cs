using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.ToolKits.Base;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Blog
{
    public partial interface IBlogService
    {
        /// <summary>
        /// 获取文章详细信息
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        Task<ServiceResult<GetPostForAdminDto>> GetPostForAdminAsync(int id);
    }
}