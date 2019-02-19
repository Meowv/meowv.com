using Meowv.Entity.Blog;
using System.Threading.Tasks;

namespace Meowv.Interface.Blog
{
    public interface IArticle
    {
        /// <summary>
        /// 添加文章
        /// </summary>
        /// <returns></returns>
        Task<bool> AddArticle();

        /// <summary>
        /// 删除文章
        /// </summary>
        /// <param name="articleId"></param>
        /// <returns></returns>
        Task<bool> DeleteArticle(int articleId);

        /// <summary>
        /// 更新文章
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        Task<bool> UpdateArticle(ArticleEntity entity);
    }
}