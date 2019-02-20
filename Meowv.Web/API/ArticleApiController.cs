using Meowv.Entity.Blog;
using Meowv.Provider.Bolg;
using Meowv.ViewModel.Response;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Web.API
{
    [ApiController]
    [Route("api")]
    public class ArticleApiController : ControllerBase
    {
        private readonly ArticleProvider _provider;

        public ArticleApiController(ArticleProvider provider)
        {
            _provider = provider;
        }

        /// <summary>
        /// 添加文章
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("add_articles")]
        public async Task<ResponseViewModel<bool>> AddArticle(ArticleEntity entity)
        {
            return new ResponseViewModel<bool>
            {
                Data = await _provider.AddArticle(entity)
            };
        }

        /// <summary>
        /// 删除文章
        /// </summary>
        /// <param name="articleId"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("delete_articles")]
        public async Task<ResponseViewModel<bool>> DeleteArticle(int articleId)
        {
            return new ResponseViewModel<bool>
            {
                Data = await _provider.DeleteArticle(articleId)
            };
        }

        /// <summary>
        /// 更新文章
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("update_articles")]
        public async Task<ResponseViewModel<bool>> UpdateArticle(ArticleEntity entity)
        {
            return new ResponseViewModel<bool>
            {
                Data = await _provider.UpdateArticle(entity)
            };
        }

        /// <summary>
        /// 获取文章详情
        /// </summary>
        /// <param name="articleId"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("get_article/{articleId}")]
        public async Task<ResponseViewModel<ArticleEntity>> GetArticle(int articleId)
        {
            return new ResponseViewModel<ArticleEntity>
            {
                Data = await _provider.GetArticle(articleId)
            };
        }

        /// <summary>
        /// 获取文章列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("get_articles")]
        public async Task<ResponseViewModel<IEnumerable<ArticleEntity>>> GetArticles()
        {
            return new ResponseViewModel<IEnumerable<ArticleEntity>>
            {
                Data = await _provider.GetArticles()
            };
        }

        /// <summary>
        /// 根据分类ID获取文章列表
        /// </summary>
        /// <param name="categoryId"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("get_articles_cid/{categoryId}")]
        public async Task<ResponseViewModel<IEnumerable<ArticleEntity>>> GetArticlesByCategoryId(int categoryId)
        {
            return new ResponseViewModel<IEnumerable<ArticleEntity>>
            {
                Data = await _provider.GetArticlesByCategoryId(categoryId)
            };
        }

        /// <summary>
        /// 根据标签ID获取文章列表
        /// </summary>
        /// <param name="tagId"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("get_articles_tid/{tagId}")]
        public async Task<ResponseViewModel<IEnumerable<ArticleEntity>>> GetArticlesByTagId(int tagId)
        {
            return new ResponseViewModel<IEnumerable<ArticleEntity>>
            {
                Data = await _provider.GetArticlesByTagId(tagId)
            };
        }
    }
}