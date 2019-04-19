using MeowvBlog.Services.Articles;
using MeowvBlog.Services.Dto.Articles.Params;
using MeowvBlog.Services.Dto.Common;
using Microsoft.AspNetCore.Mvc;
using System.Threading.Tasks;
using UPrime;
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
    }
}