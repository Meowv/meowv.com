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

        public ArticleApiController(ArticleProvider provider) => _provider = provider;

        /// <summary>
        /// 添加文章
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("add_article")]
        public async Task<ResponseViewModel<bool>> AddArticle(ArticleEntity entity) => new ResponseViewModel<bool>
        {
            Data = await _provider.AddArticle(entity)
        };

        /// <summary>
        /// 删除文章
        /// </summary>
        /// <param name="articleId"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("delete_article")]
        public async Task<ResponseViewModel<bool>> DeleteArticle(int articleId) => new ResponseViewModel<bool>
        {
            Data = await _provider.DeleteArticle(articleId)
        };

        /// <summary>
        /// 更新文章
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("update_article")]
        public async Task<ResponseViewModel<bool>> UpdateArticle(ArticleEntity entity) => new ResponseViewModel<bool>
        {
            Data = await _provider.UpdateArticle(entity)
        };

        /// <summary>
        /// 获取文章详情
        /// </summary>
        /// <param name="aId"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("get_article/{aId}")]
        public async Task<ResponseViewModel<ArticleEntity>> GetArticle(int aId) => new ResponseViewModel<ArticleEntity>
        {
            Data = await _provider.GetArticle(aId)
        };

        /// <summary>
        /// 获取文章列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("get_articles")]
        public async Task<ResponseViewModel<IEnumerable<ArticleEntity>>> GetArticles() => new ResponseViewModel<IEnumerable<ArticleEntity>>
        {
            Data = await _provider.GetArticles()
        };

        /// <summary>
        /// 根据分类ID获取文章列表
        /// </summary>
        /// <param name="cId"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("get_articles/{cId}")]
        public async Task<ResponseViewModel<IEnumerable<ArticleEntity>>> GetArticlesByCategoryId(int cId) => new ResponseViewModel<IEnumerable<ArticleEntity>>
        {
            Data = await _provider.GetArticlesByCategoryId(cId)
        };

        /// <summary>
        /// 根据标签ID获取文章列表
        /// </summary>
        /// <param name="tId"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("get_articles/{tId}")]
        public async Task<ResponseViewModel<IEnumerable<ArticleEntity>>> GetArticlesByTagId(int tId) => new ResponseViewModel<IEnumerable<ArticleEntity>>
        {
            Data = await _provider.GetArticlesByTagId(tId)
        };

        /// <summary>
        /// 添加分类
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("add_category")]
        public async Task<ResponseViewModel<bool>> AddCategory(CategoryEntity entity) => new ResponseViewModel<bool>
        {
            Data = await _provider.AddCategory(entity)
        };

        /// <summary>
        /// 删除分类
        /// </summary>
        /// <param name="cId"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("delete_category")]
        public async Task<ResponseViewModel<bool>> DeleteCategory(int cId) => new ResponseViewModel<bool>
        {
            Data = await _provider.DeleteCategory(cId)
        };

        /// <summary>
        /// 更新分类
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("update_category")]
        public async Task<ResponseViewModel<bool>> UpdateCategory(CategoryEntity entity) => new ResponseViewModel<bool>
        {
            Data = await _provider.UpdateCategory(entity)
        };

        /// <summary>
        /// 获取分类列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("get_categories")]
        public async Task<ResponseViewModel<IEnumerable<CategoryEntity>>> GetCategories() => new ResponseViewModel<IEnumerable<CategoryEntity>>
        {
            Data = await _provider.GetCategories()
        };

        /// <summary>
        /// 根据文章ID获取分类
        /// </summary>
        /// <param name="aId"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("get_category/{aId}")]
        public async Task<ResponseViewModel<CategoryEntity>> GetCategoryByArticleId(int aId) => new ResponseViewModel<CategoryEntity>
        {
            Data = await _provider.GetCategoryByArticleId(aId)
        };

        /// <summary>
        /// 添加标签
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("add_tag")]
        public async Task<ResponseViewModel<bool>> AddTag(TagEntity entity) => new ResponseViewModel<bool>
        {
            Data = await _provider.AddTag(entity)
        };

        /// <summary>
        /// 删除标签
        /// </summary>
        /// <param name="tId"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("delete_tag")]
        public async Task<ResponseViewModel<bool>> DeleteTag(int tId) => new ResponseViewModel<bool>
        {
            Data = await _provider.DeleteArticle(tId)
        };

        /// <summary>
        /// 更新标签
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("update_tag")]
        public async Task<ResponseViewModel<bool>> UpdateTag(TagEntity entity) => new ResponseViewModel<bool>
        {
            Data = await _provider.UpdateTag(entity)
        };

        /// <summary>
        /// 获取标签列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("get_tags")]
        public async Task<ResponseViewModel<IEnumerable<TagEntity>>> GetTags() => new ResponseViewModel<IEnumerable<TagEntity>>
        {
            Data = await _provider.GetTags()
        };

        /// <summary>
        /// 获取标签列表
        /// </summary>
        /// <param name="aId"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("get_tags/{aId}")]
        public async Task<ResponseViewModel<IEnumerable<TagEntity>>> GetTagsByArticleId(int aId) => new ResponseViewModel<IEnumerable<TagEntity>>
        {
            Data = await _provider.GetTags(aId)
        };
    }
}