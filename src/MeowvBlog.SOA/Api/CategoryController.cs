using MeowvBlog.Core.Domain.Categories;
using MeowvBlog.Services.Categories;
using MeowvBlog.Services.Dto.Articles.Params;
using MeowvBlog.Services.Dto.Categories;
using MeowvBlog.Services.Dto.Categories.Params;
using MeowvBlog.Services.Dto.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Threading.Tasks;
using UPrime;
using UPrime.WebApi;

namespace MeowvBlog.SOA.Api
{
    /// <summary>
    /// 分类相关API
    /// </summary>
    [Route("Category")]
    public class CategoryController : ApiControllerBase
    {
        private readonly ICategoryService _categoryService;

        public CategoryController()
        {
            _categoryService = UPrimeEngine.Instance.Resolve<ICategoryService>();
        }

        /// <summary>
        /// 所有分类列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("Get")]
        [AllowAnonymous]
        [ResponseCache(CacheProfileName = "Hourly")]
        public async Task<UPrimeResponse<IList<CategoryDto>>> Get()
        {
            var response = new UPrimeResponse<IList<CategoryDto>>();

            var result = await _categoryService.GetAsync();
            if (!result.Success)
                response.SetMessage(UPrimeResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;

            return response;
        }

        /// <summary>
        /// 通过分类名称查询所有文章列表
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("Article/Query")]
        [AllowAnonymous]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "name" })]
        public async Task<UPrimeResponse<IList<GetArticleListOutput>>> QueryArticleListBy([Required] string name)
        {
            var response = new UPrimeResponse<IList<GetArticleListOutput>>();

            var result = await _categoryService.QueryArticleListByAsync(name);
            if (!result.Success)
                response.SetMessage(UPrimeResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;

            return response;
        }

        /// <summary>
        /// Admin-查询所有分类
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("Query")]
        public async Task<UPrimeResponse<IList<Category>>> Query()
        {
            var response = new UPrimeResponse<IList<Category>>();

            var result = await _categoryService.QueryAsync();
            if (!result.Success)
                response.SetMessage(UPrimeResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;

            return response;
        }

        /// <summary>
        /// 新增分类
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("Insert")]
        public async Task<UPrimeResponse> Insert([FromBody] CategoryDto input)
        {
            var response = new UPrimeResponse<string>();

            var result = await _categoryService.InsertAsync(input);
            if (!result.Success)
                response.SetMessage(UPrimeResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;

            return response;
        }

        /// <summary>
        /// 更新分类
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("Update")]
        public async Task<UPrimeResponse> Update([FromBody] UpdateCategoryInput input)
        {
            var response = new UPrimeResponse<string>();

            var result = await _categoryService.UpdateAsync(input);
            if (!result.Success)
                response.SetMessage(UPrimeResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;

            return response;
        }

        /// <summary>
        /// 删除分类
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("Delete")]
        public async Task<UPrimeResponse> Delete([FromBody] DeleteInput input)
        {
            var response = new UPrimeResponse<string>();

            var result = await _categoryService.DeleteAsync(input);

            if (!result.Success)
                response.SetMessage(UPrimeResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;

            return response;
        }
    }
}