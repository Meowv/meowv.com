using Meowv.Entity;
using Meowv.Entity.Blog;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Meowv.DataModel.Blog
{
    public class ArticleDataModel
    {
        private readonly MeowvDbContext _context;

        public ArticleDataModel(MeowvDbContext context) => _context = context;

        /// <summary>
        /// 添加文章
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public async Task<bool> AddArticle(ArticleEntity entity)
        {
            await _context.Articles.AddAsync(entity);
            return await _context.SaveChangesAsync() > 0;
        }

        /// <summary>
        /// 删除文章
        /// </summary>
        /// <param name="articleId"></param>
        /// <returns></returns>
        public async Task<bool> DeleteArticle(int articleId)
        {
            var article = await GetArticle(articleId);
            if (article != null)
            {
                article.IsDelete = 1;
                return await _context.SaveChangesAsync() > 0;
            }
            return false;
        }

        /// <summary>
        /// 更新文章
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public async Task<bool> UpdateArticle(ArticleEntity entity)
        {
            var article = await GetArticle(entity.ArticleId);
            if (article != null)
            {
                article = entity;
                return await _context.SaveChangesAsync() > 0;
            }
            return false;
        }

        /// <summary>
        /// 获取文章详情
        /// </summary>
        /// <param name="articleId"></param>
        /// <returns></returns>
        public async Task<ArticleEntity> GetArticle(int articleId) => await _context.Articles.FindAsync(articleId);

        /// <summary>
        /// 获取文章列表
        /// </summary>
        /// <returns></returns>
        public async Task<IEnumerable<ArticleEntity>> GetArticles() => await _context.Articles.Where(x => x.IsDelete == 0).OrderByDescending(x => x.PostTime).ToListAsync();

        /// <summary>
        /// 根据分类ID获取文章列表
        /// </summary>
        /// <param name="categoryId"></param>
        /// <returns></returns>
        public async Task<IEnumerable<ArticleEntity>> GetArticlesByCategoryId(int categoryId) => await _context.Articles.Where(a => a.ArticleId == 0).Join(_context.ArticleCategories.Where(c => c.IsDelete == 0), a => a.ArticleId, c => c.ArticleId, (a, c) => new ArticleEntity
        {
            ArticleId = a.ArticleId,
            Title = a.Title,
            Url = a.Url,
            Content = a.Content,
            PostTime = a.PostTime
        }).OrderByDescending(a => a.PostTime).ToListAsync();

        /// <summary>
        /// 根据标签ID获取文章列表
        /// </summary>
        /// <param name="tagId"></param>
        /// <returns></returns>
        public async Task<IEnumerable<ArticleEntity>> GetArticlesByTagId(int tagId) => await _context.Articles.Where(a => a.ArticleId == 0).Join(_context.ArticleTags.Where(t => t.IsDelete == 0), a => a.ArticleId, t => t.ArticleId, (a, t) => new ArticleEntity
        {
            ArticleId = a.ArticleId,
            Title = a.Title,
            Url = a.Url,
            Content = a.Content,
            PostTime = a.PostTime
        }).OrderByDescending(a => a.PostTime).ToListAsync();

        /// <summary>
        /// 添加分类
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public async Task<bool> AddCategory(CategoryEntity entity)
        {
            await _context.Categories.AddAsync(entity);
            return await _context.SaveChangesAsync() > 0;
        }

        /// <summary>
        /// 删除分类
        /// </summary>
        /// <param name="categoryId"></param>
        /// <returns></returns>
        public async Task<bool> DeleteCategory(int categoryId)
        {
            var entity = await _context.Categories.FindAsync(categoryId);
            if (entity != null)
            {
                entity.IsDelete = 1;
                return await _context.SaveChangesAsync() > 0;
            }
            return false;
        }

        /// <summary>
        /// 更新分类
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public async Task<bool> UpdateCategory(CategoryEntity entity)
        {
            var category = await _context.Categories.FindAsync(entity.CategoryId);
            if (entity != null)
            {
                category = entity;
                return await _context.SaveChangesAsync() > 0;
            }
            return false;
        }

        /// <summary>
        /// 获取分类列表
        /// </summary>
        /// <returns></returns>
        public async Task<IEnumerable<CategoryEntity>> GetCategories() => await _context.Categories.Where(x => x.IsDelete == 0).OrderByDescending(x => x.CreateTime).ToListAsync();

        /// <summary>
        /// 根据文章ID获取分类
        /// </summary>
        /// <param name="articleId"></param>
        /// <returns></returns>
        public async Task<CategoryEntity> GetCategoryByArticleId(int articleId) => await
            (from c in _context.Categories.Where(x => x.IsDelete == 0)
             join ac in _context.ArticleCategories.Where(x => x.IsDelete == 0 && x.ArticleId == articleId) on c.CategoryId equals ac.CategoryId
             select new CategoryEntity
             {
                 CategoryName = c.CategoryName
             }).FirstOrDefaultAsync();

        /// <summary>
        /// 添加标签
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public async Task<bool> AddTag(TagEntity entity)
        {
            await _context.Tags.AddAsync(entity);
            return await _context.SaveChangesAsync() > 0;
        }

        /// <summary>
        /// 删除标签
        /// </summary>
        /// <param name="tagId"></param>
        /// <returns></returns>
        public async Task<bool> DeleteTag(int tagId)
        {
            var entity = await _context.Tags.FindAsync(tagId);
            if (entity != null)
            {
                entity.IsDelete = 0;
                return await _context.SaveChangesAsync() > 0;
            }
            return false;
        }

        /// <summary>
        /// 更新标签
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public async Task<bool> UpdateTag(TagEntity entity)
        {
            var tag = await _context.Tags.FindAsync(entity.TagId);
            if (entity != null)
            {
                tag = entity;
                return await _context.SaveChangesAsync() > 0;
            }
            return false;
        }

        /// <summary>
        /// 获取标签列表
        /// </summary>
        /// <returns></returns>
        public async Task<IEnumerable<TagEntity>> GetTags() => await _context.Tags.Where(x => x.IsDelete == 0).OrderByDescending(x => x.CreateTime).ToListAsync();

        /// <summary>
        /// 根据文章ID获取标签列表
        /// </summary>
        /// <param name="articleId"></param>
        /// <returns></returns>
        public async Task<IEnumerable<TagEntity>> GetTags(int articleId) => await
            (from t in _context.Tags.Where(x => x.IsDelete == 0)
             join at in _context.ArticleTags.Where(x => x.IsDelete == 0 && x.ArticleId == articleId) on t.TagId equals at.TagId
             select new TagEntity
             {
                 TagName = t.TagName
             }).ToListAsync();
    }
}