using Meowv.Entity.Blog;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Interface.Blog
{
    public interface ITag
    {
        /// <summary>
        /// 添加标签
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        Task<bool> AddTag(TagEntity entity);

        /// <summary>
        /// 删除标签
        /// </summary>
        /// <param name="tagId"></param>
        /// <returns></returns>
        Task<bool> DeleteTag(int tagId);

        /// <summary>
        /// 更新标签
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        Task<bool> UpdateTag(TagEntity entity);

        /// <summary>
        /// 获取标签列表
        /// </summary>
        /// <returns></returns>
        Task<IEnumerable<TagEntity>> GetTags();

        /// <summary>
        /// 根据文章ID获取标签列表
        /// </summary>
        /// <param name="articleId"></param>
        /// <returns></returns>
        Task<IEnumerable<TagEntity>> GetTags(int articleId);
    }
}