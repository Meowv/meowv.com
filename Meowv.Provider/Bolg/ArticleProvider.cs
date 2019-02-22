using Meowv.DataModel.Blog;
using Meowv.Entity.Blog;
using Meowv.Interface.Blog;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Provider.Bolg
{
    public class ArticleProvider : IArticle, ICategory, ITag
    {
        private readonly ArticleDataModel _data;

        public ArticleProvider(ArticleDataModel data) => _data = data;

        /// <summary>
        /// 添加文章
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public Task<bool> AddArticle(ArticleEntity entity) => _data.AddArticle(entity);

        /// <summary>
        /// 删除文章
        /// </summary>
        /// <param name="articleId"></param>
        /// <returns></returns>
        public Task<bool> DeleteArticle(int articleId) => _data.DeleteArticle(articleId);

        /// <summary>
        /// 更新文章
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public Task<bool> UpdateArticle(ArticleEntity entity) => _data.UpdateArticle(entity);

        /// <summary>
        /// 获取文章详情
        /// </summary>
        /// <param name="articleId"></param>
        /// <returns></returns>
        public Task<ArticleEntity> GetArticle(int articleId) => _data.GetArticle(articleId);

        /// <summary>
        /// 获取文章列表
        /// </summary>
        /// <returns></returns>
        public Task<IEnumerable<ArticleEntity>> GetArticles() => _data.GetArticles();

        /// <summary>
        /// 根据分类ID获取文章列表
        /// </summary>
        /// <param name="categoryId"></param>
        /// <returns></returns>
        public Task<IEnumerable<ArticleEntity>> GetArticlesByCategoryId(int categoryId) => _data.GetArticlesByCategoryId(categoryId);

        /// <summary>
        /// 根据标签ID获取文章列表
        /// </summary>
        /// <param name="tagId"></param>
        /// <returns></returns>
        public Task<IEnumerable<ArticleEntity>> GetArticlesByTagId(int tagId) => _data.GetArticlesByTagId(tagId);

        /// <summary>
        /// 添加分类
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public Task<bool> AddCategory(CategoryEntity entity) => _data.AddCategory(entity);

        /// <summary>
        /// 删除分类
        /// </summary>
        /// <param name="categoryId"></param>
        /// <returns></returns>
        public Task<bool> DeleteCategory(int categoryId) => _data.DeleteArticle(categoryId);

        /// <summary>
        /// 更新分类
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public Task<bool> UpdateCategory(CategoryEntity entity) => _data.UpdateCategory(entity);

        /// <summary>
        /// 获取分类列表
        /// </summary>
        /// <returns></returns>
        public Task<IEnumerable<CategoryEntity>> GetCategories() => _data.GetCategories();

        /// <summary>
        /// 根据文章ID获取分类
        /// </summary>
        /// <param name="articleId"></param>
        /// <returns></returns>
        public Task<CategoryEntity> GetCategoryByArticleId(int articleId) => _data.GetCategoryByArticleId(articleId);

        /// <summary>
        /// 添加标签
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public Task<bool> AddTag(TagEntity entity) => _data.AddTag(entity);

        /// <summary>
        /// 删除标签
        /// </summary>
        /// <param name="tagId"></param>
        /// <returns></returns>
        public Task<bool> DeleteTag(int tagId) => _data.DeleteTag(tagId);

        /// <summary>
        /// 更新标签
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public Task<bool> UpdateTag(TagEntity entity) => _data.UpdateTag(entity);

        /// <summary>
        /// 获取标签列表
        /// </summary>
        /// <returns></returns>
        public Task<IEnumerable<TagEntity>> GetTags() => _data.GetTags();

        /// <summary>
        /// 根据文章ID获取标签列表
        /// </summary>
        /// <param name="articleId"></param>
        /// <returns></returns>
        public Task<IEnumerable<TagEntity>> GetTags(int articleId) => _data.GetTags(articleId);
    }
}