using MeowvBlog.Services.Blog;
using MeowvBlog.Services.Dto;
using MeowvBlog.Services.Dto.Blog;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plus;
using Plus.Services.Dto;
using Plus.WebApi;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Xml.Linq;

namespace MeowvBlog.Web.Controllers.Apis
{
    [ApiController]
    [Authorize]
    [Route("api/[controller]")]
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
        public async Task<Response<string>> InsertPost([FromBody] PostForAdminDto dto)
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
        public async Task<Response<string>> UpdatePost(int id, [FromBody] PostForAdminDto dto)
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
        /// 获取文章详细信息
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("post")]
        [AllowAnonymous]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "url" })]
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
        /// 获取文章详细信息 For Admin
        /// </summary>
        [HttpGet]
        [Route("admin/post")]
        public async Task<Response<GetPostForAdminDto>> GetPostForAdmin(int id)
        {
            var response = new Response<GetPostForAdminDto>();

            var result = await _blogService.GetPostForAdmin(id);
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
        [AllowAnonymous]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "page", "limit" })]
        public async Task<Response<PagedResultDto<QueryPostDto>>> QueryPost([FromQuery] PagingInput input)
        {
            var response = new Response<PagedResultDto<QueryPostDto>>
            {
                Result = await _blogService.QueryPosts(input)
            };
            return response;
        }

        /// <summary>
        /// 分页查询文章列表 For Admin
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("post/admin/query")]
        public async Task<Response<PagedResultDto<QueryPostForAdminDto>>> QueryPostsForAdmin([FromQuery] PagingInput input)
        {
            var response = new Response<PagedResultDto<QueryPostForAdminDto>>
            {
                Result = await _blogService.QueryPostsForAdmin(input)
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
        [AllowAnonymous]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "name" })]
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
        [AllowAnonymous]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "name" })]
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
        [AllowAnonymous]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "name" })]
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
        [AllowAnonymous]
        [ResponseCache(CacheProfileName = "default")]
        public async Task<Response<IList<QueryTagDto>>> QueryTags()
        {
            var response = new Response<IList<QueryTagDto>>
            {
                Result = await _blogService.QueryTags()
            };
            return response;
        }

        /// <summary>
        /// 查询标签列表 For Admin
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("admin/tags")]
        public async Task<Response<IList<QueryTagForAdminDto>>> QueryTagsForAdmin()
        {
            var response = new Response<IList<QueryTagForAdminDto>>
            {
                Result = await _blogService.QueryTagsForAdmin()
            };
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
        public async Task<Response<string>> InsertCategory([FromBody] CategoryDto dto)
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
        [AllowAnonymous]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "name" })]
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
        [AllowAnonymous]
        [ResponseCache(CacheProfileName = "default")]
        public async Task<Response<IList<QueryCategoryDto>>> QueryCategories()
        {
            var response = new Response<IList<QueryCategoryDto>>
            {
                Result = await _blogService.QueryCategories()
            };
            return response;
        }

        /// <summary>
        /// 查询分类列表  For Admin
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("admin/categories")]
        public async Task<Response<IList<QueryCategoryForAdminDto>>> QueryCategoriesForAdmin()
        {
            var response = new Response<IList<QueryCategoryForAdminDto>>
            {
                Result = await _blogService.QueryCategoriesForAdmin()
            };
            return response;
        }

        #endregion

        #region FriendLink

        /// <summary>
        /// 新增友链
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("friendlink")]
        public async Task<Response<string>> InsertFriendLink(FriendLinkDto dto)
        {
            var response = new Response<string>();

            var result = await _blogService.InsertFriendLink(dto);
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        /// <summary>
        /// 友链列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("friendlinks")]
        [AllowAnonymous]
        [ResponseCache(CacheProfileName = "default")]
        public async Task<Response<IList<FriendLinkDto>>> QueryFriendLinks()
        {
            var response = new Response<IList<FriendLinkDto>>();

            var result = await _blogService.QueryFriendLinks();
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }

        #endregion

        #region RSS

        /// <summary>
        /// 生成RSS
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("/rss")]
        [AllowAnonymous]
        public async Task<IActionResult> GenerateRss()
        {
            var list = await _blogService.QueryPostRss();

            var document = new XDocument(
                new XDeclaration(version: "2.0", encoding: "utf-8", standalone: "no"),
                new XElement("rss", new XAttribute("version", "2.0"),
                    new XElement("channel",
                        new XElement("title", "阿星Plus"),
                        new XElement("description", "生命不息，奋斗不止"),
                        new XElement("link", "https://meowv.com"),

                        from item in list
                        select

                        new XElement("item",
                            new XElement("title", item.Title),
                            new XElement("link", $"https://meowv.com/post{item.Link}"),
                            new XElement("description", item.Description),
                            new XElement("author", item.Author),
                            new XElement("category", item.Category),
                            new XElement("pubdate", item.PubDate)
                        )
                    )
                )
            );

            return new ContentResult
            {
                Content = document.ToString(),
                ContentType = "text/xml",
                StatusCode = 200
            };
        }

        #endregion
    }
}