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
        public ArticleDataModel(MeowvDbContext context)
        {
            _context = context;
        }

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
        public async Task<ArticleEntity> GetArticle(int articleId)
        {
            return await _context.Articles.FindAsync(articleId);
        }

        /// <summary>
        /// 获取文章列表
        /// </summary>
        /// <returns></returns>
        public async Task<IEnumerable<ArticleEntity>> GetArticles()
        {
            return await _context.Articles.Where(x => x.IsDelete == 0).OrderByDescending(x => x.PostTime).ToListAsync();
        }
    }
}