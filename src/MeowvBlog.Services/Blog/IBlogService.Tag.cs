using MeowvBlog.Services.Dto.Blog;
using Plus;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Blog
{
    public partial interface IBlogService
    {
        /// <summary>
        /// 新增标签
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> InsertTag(TagDto dto);

        /// <summary>
        /// 删除标签
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> DeleteTag(int id);

        /// <summary>
        /// 更新标签
        /// </summary>
        /// <param name="id"></param>
        /// <param name="dto"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> UpdateTag(int id, TagDto dto);

        /// <summary>
        /// 获取标签名称
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> GetTag(string name);

        /// <summary>
        /// 查询标签列表
        /// </summary>
        /// <returns></returns>
        Task<IList<QueryTagDto>> QueryTags();

        /// <summary>
        /// 查询标签列表 For Admin
        /// </summary>
        /// <returns></returns>
        Task<IList<QueryTagForAdminDto>> QueryTagsForAdmin();
    }
}