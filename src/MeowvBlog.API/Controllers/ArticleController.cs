using MeowvBlog.Services.Articles;
using MeowvBlog.Services.Dto.Articles.Params;
using Microsoft.AspNetCore.Mvc;
using System.Threading.Tasks;
using UPrime;
using UPrime.WebApi;

namespace MeowvBlog.API.Controllers
{
    /// <summary>
    /// 文章API
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
        /// 新增文章'MeowvBlog.Core.Domain.Articles.Repositories.IArticleRepository'
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
            return response;
        }
    }
}