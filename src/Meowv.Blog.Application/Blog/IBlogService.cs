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
    }
}