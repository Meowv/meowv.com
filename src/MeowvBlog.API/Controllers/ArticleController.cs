using MeowvBlog.Services.Articles;
using MeowvBlog.Services.Dto.Articles;
using MeowvBlog.Services.Dto.Articles.Params;
using MeowvBlog.Services.Dto.Common;
using Microsoft.AspNetCore.Mvc;
using System.Threading.Tasks;
using UPrime;
using UPrime.Services.Dto;
using UPrime.WebApi;

namespace MeowvBlog.API.Controllers
{
    /// <summary>
    /// 文章相关API
    /// </summary>
    [Route("Article")]
    public class ArticleController : ApiControllerBase
    {
        private readonly IArticleService _articleService;

        public ArticleController()
        {
            _articleService = UPrimeEngine.Instance.Resolve<IArticleService>();
        }

        #region Article

        /// <summary>
        /// 获取一篇文章详细信息
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("Get")]
        public async Task<UPrimeResponse<ArticleDto>> GetAsync(int id)
        {
            var response = new UPrimeResponse<ArticleDto>();

            var result = await _articleService.GetAsync(id);

            if (!result.Success)
                response.SetMessage(UPrimeResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;

            return response;
        }

        /// <summary>
        /// 分页获取文章列表
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("GetList")]
        public async Task<UPrimeResponse<PagedResultDto<ArticleBriefDto>>> GetListAsync(PagingInput input)
        {
            return new UPrimeResponse<PagedResultDto<ArticleBriefDto>>
            {
                Result = await _articleService.GetListAsync(input)
            };
        }

        /// <summary>
        /// 新增文章
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("Insert")]
        public async Task<UPrimeResponse> Insert([FromBody] InsertArticleInput input)
        {
            var response = new UPrimeResponse<string>();

            var result = await _articleService.InsertAsync(input);
            if (!result.Success)
                response.SetMessage(UPrimeResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;

            return response;
        }

        /// <summary>
        /// 更新文章
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("Update")]
        public async Task<UPrimeResponse> Update([FromBody] UpdateArticleInput input)
        {
            var response = new UPrimeResponse<string>();

            var result = await _articleService.UpdateAsync(input);
            if (!result.Success)
                response.SetMessage(UPrimeResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;

            return response;
        }

        /// <summary>
        /// 删除文章
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("Delete")]
        public async Task<UPrimeResponse> Delete([FromBody] DeleteInput input)
        {
            var response = new UPrimeResponse<string>();

            var result = await _articleService.DeleteAsync(input);

            if (!result.Success)
                response.SetMessage(UPrimeResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;

            return response;
        }

        #endregion

        #region Category

        /// <summary>
        /// 新增文章对应的分类
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("Category/Insert")]
        public async Task<UPrimeResponse> InsertArticleCategory([FromBody] InsertArticleCategoryInput input)
        {
            var response = new UPrimeResponse<string>();

            var result = await _articleService.InsertArticleCategoryAsync(input);

            if (!result.Success)
                response.SetMessage(UPrimeResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;

            return response;
        }

        /// <summary>
        /// 删除文章对应的分类
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("Category/Delete")]
        public async Task<UPrimeResponse> DeleteArticleCategory([FromBody] DeleteInput input)
        {
            var response = new UPrimeResponse<string>();

            var result = await _articleService.DeleteArticleCategoryAsync(input);

            if (!result.Success)
                response.SetMessage(UPrimeResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;

            return response;
        }

        #endregion

        #region Tag

        /// <summary>
        /// 新增文章对应的标签
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("Tag/Insert")]
        public async Task<UPrimeResponse> InsertArticleTagAsync([FromBody] InsertArticleTagInput input)
        {
            var response = new UPrimeResponse<string>();

            var result = await _articleService.InsertArticleTagAsync(input);

            if (!result.Success)
                response.SetMessage(UPrimeResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;

            return response;
        }

        /// <summary>
        /// 删除文章对应的标签
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("Tag/Delete")]
        public async Task<UPrimeResponse> DeleteArticleTagAsync([FromBody] DeleteInput input)
        {
            var response = new UPrimeResponse<string>();

            var result = await _articleService.DeleteArticleTagAsync(input);

            if (!result.Success)
                response.SetMessage(UPrimeResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;

            return response;
        }

        #endregion
    }
}