using MeowvBlog.Services.Dto.Blog;
using Plus;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Blog
{
    public partial interface IBlogService
    {
        /// <summary>
        /// 新增文章的标签
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> InsertPostTag(PostTagDto dto);

        /// <summary>
        /// 删除文章的标签
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> DeletePostTag(int id);
    }
}