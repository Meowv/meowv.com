using Meowv.Entity.Blog;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Interface.Blog
{
    public interface IArticle
    {
        /// <summary>
        /// 添加文章
        /// </summary>
        /// <returns></returns>
        Task<bool> AddArticle(ArticleEntity entity);

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

        /// <summary>
        /// 获取文章详情
        /// </summary>
        /// <param name="articleId"></param>
        /// <returns></returns>
        Task<ArticleEntity> GetArticle(int articleId);

        /// <summary>
        /// 获取文章列表
        /// </summary>
        /// <returns></returns>
        Task<IEnumerable<ArticleEntity>> GetArticles();

        /// <summary>
        /// 根据分类ID获取文章列表
        /// </summary>
        /// <param name="categoryId"></param>
        /// <returns></returns>
        Task<IEnumerable<ArticleEntity>> GetArticlesByCategoryId(int categoryId);

        /// <summary>
        /// 根据标签ID获取文章列表
        /// </summary>
        /// <param name="tagId"></param>
        /// <returns></returns>
        Task<IEnumerable<ArticleEntity>> GetArticlesByTagId(int tagId);
    }
}