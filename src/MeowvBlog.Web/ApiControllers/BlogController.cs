using MeowvBlog.Services.Blog;
using MeowvBlog.Services.Dto;
using MeowvBlog.Services.Dto.Blog;
using Microsoft.AspNetCore.Mvc;
using Plus;
using Plus.Services.Dto;
using Plus.WebApi;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Web.ApiControllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class BlogController : ControllerBase
    {
        private readonly IBlogService _blogService;

        public BlogController()
        {
            _blogService = PlusEngine.Instance.Resolve<IBlogService>();
        }

        #region posts

        /// <summary>
        /// 新增文章
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("post")]
        public async Task<Response<string>> InsertPost([FromBody] PostDto dto)
        {
            var response = new Response<string>();

            var result = await _blogService.InsertPost(dto);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 删除文章
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [HttpDelete]
        [Route("post")]
        public async Task<Response<string>> DeletePost(int id)
        {
            var response = new Response<string>();

            var result = await _blogService.DeletePost(id);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 更新文章
        /// </summary>
        /// <param name="id"></param>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPut]
        [Route("post")]
        public async Task<Response<string>> UpdatePost(int id, [FromBody] PostDto dto)
        {
            var response = new Response<string>();

            var result = await _blogService.UpdatePost(id, dto);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 获取文章
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("post")]
        public async Task<Response<GetPostDto>> GetPost(string url)
        {
            var response = new Response<GetPostDto>();

            var result = await _blogService.GetPost(url);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 分页查询文章列表
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("post/query")]
        public async Task<Response<PagedResultDto<QueryPostDto>>> QueryPost([FromQuery] PagingInput input)
        {
            var response = new Response<PagedResultDto<QueryPostDto>>
            {
                Result = await _blogService.QueryPosts(input)
            };
            return response;
        }

        /// <summary>
        /// 通过标签查询文章列表
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("post/querybytag")]
        public async Task<Response<IList<QueryPostDto>>> QueryPostsByTag(string name)
        {
            var response = new Response<IList<QueryPostDto>>
            {
                Result = await _blogService.QueryPostsByTag(name)
            };
            return response;
        }

        /// <summary>
        /// 通过分类查询文章列表
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("post/querybycategory")]
        public async Task<Response<IList<QueryPostDto>>> QueryPostsByCategory(string name)
        {
            var response = new Response<IList<QueryPostDto>>
            {
                Result = await _blogService.QueryPostsByCategory(name)
            };
            return response;
        }

        #endregion

        #region tags

        /// <summary>
        /// 新增标签
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("tag")]
        public async Task<Response<string>> InsertTag([FromBody] TagDto dto)
        {
            var response = new Response<string>();

            var result = await _blogService.InsertTag(dto);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 删除标签
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [HttpDelete]
        [Route("tag")]
        public async Task<Response<string>> DeleteTag(int id)
        {
            var response = new Response<string>();

            var result = await _blogService.DeleteTag(id);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 更新标签
        /// </summary>
        /// <param name="id"></param>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPut]
        [Route("tag")]
        public async Task<Response<string>> UpdateTag(int id, [FromBody] TagDto dto)
        {
            var response = new Response<string>();

            var result = await _blogService.UpdateTag(id, dto);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 获取标签名称
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("tag")]
        public async Task<Response<string>> GetTag(string name)
        {
            var response = new Response<string>();

            var result = await _blogService.GetTag(name);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 查询标签列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("tags")]
        public async Task<Response<IList<QueryTagDto>>> QueryTags()
        {
            var response = new Response<IList<QueryTagDto>>
            {
                Result = await _blogService.QueryTags()
            };
            return response;
        }

        #endregion

        #region post_tags

        /// <summary>
        /// 新增文章的标签 
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("post_tag")]
        public async Task<Response<string>> InsertPostTag([FromBody] PostTagDto dto)
        {
            var response = new Response<string>();

            var result = await _blogService.InsertPostTag(dto);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 删除文章的标签
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [HttpDelete]
        [Route("post_tag")]
        public async Task<Response<string>> DeletePostTag(int id)
        {
            var response = new Response<string>();

            var result = await _blogService.DeletePostTag(id);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        #endregion

        #region categories

        /// <summary>
        /// 新增分类
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("category")]
        public async Task<Response<string>> InsertCategory(CategoryDto dto)
        {
            var response = new Response<string>();

            var result = await _blogService.InsertCategory(dto);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 删除分类
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [HttpDelete]
        [Route("category")]
        public async Task<Response<string>> DeleteCategory(int id)
        {
            var response = new Response<string>();

            var result = await _blogService.DeleteCategory(id);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 更新分类
        /// </summary>
        /// <param name="id"></param>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPut]
        [Route("category")]
        public async Task<Response<string>> UpdateCategory(int id, CategoryDto dto)
        {
            var response = new Response<string>();

            var result = await _blogService.UpdateCategory(id, dto);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 获取分类名称
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("category")]
        public async Task<Response<string>> GetCategory(string name)
        {
            var response = new Response<string>();

            var result = await _blogService.GetCategory(name);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 查询分类列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("categories")]
        public async Task<Response<IList<QueryCategoryDto>>> QueryCategories()
        {
            var response = new Response<IList<QueryCategoryDto>>
            {
                Result = await _blogService.QueryCategories()
            };
            return response;
        }

        #endregion
    }
}