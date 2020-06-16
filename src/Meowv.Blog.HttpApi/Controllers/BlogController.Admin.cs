using Meowv.Blog.Application.Contracts;
using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.Application.Contracts.Blog.Params;
using Meowv.Blog.ToolKits.Base;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Threading.Tasks;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.HttpApi.Controllers
{
    public partial class BlogController
    {
        #region Posts

        /// <summary>
        /// 获取文章详情
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [HttpGet]
        [Authorize]
        [Route("admin/post")]
        [Route("post/admin")]
        [ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
        public async Task<ServiceResult<PostForAdminDto>> GetPostForAdminAsync([Required] int id)
        {
            return await _blogService.GetPostForAdminAsync(id);
        }

        /// <summary>
        /// 分页查询文章列表
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpGet]
        [Authorize]
        [Route("admin/posts")]
        [Route("post/query/admin")]
        [ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
        public async Task<ServiceResult<PagedList<QueryPostForAdminDto>>> QueryPostsForAdminAsync([FromQuery] PagingInput input)
        {
            return await _blogService.QueryPostsForAdminAsync(input);
        }

        /// <summary>
        /// 新增文章
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPost]
        [Authorize]
        [Route("post")]
        [ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
        public async Task<ServiceResult> InsertPostAsync([FromBody] EditPostInput input)
        {
            return await _blogService.InsertPostAsync(input);
        }

        /// <summary>
        /// 更新文章
        /// </summary>
        /// <param name="id"></param>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPut]
        [Authorize]
        [Route("post")]
        [ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
        public async Task<ServiceResult> UpdatePostAsync([Required] int id, [FromBody] EditPostInput input)
        {
            return await _blogService.UpdatePostAsync(id, input);
        }

        /// <summary>
        /// 删除文章
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [HttpDelete]
        [Authorize]
        [Route("post")]
        [ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
        public async Task<ServiceResult> DeletePostAsync([Required] int id)
        {
            return await _blogService.DeletePostAsync(id);
        }

        #endregion Posts

        #region Categories

        /// <summary>
        /// 查询分类列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Authorize]
        [Route("admin/categories")]
        [Route("categories/admin")]
        [ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
        public async Task<ServiceResult<IEnumerable<QueryCategoryForAdminDto>>> QueryCategoriesForAdminAsync()
        {
            return await _blogService.QueryCategoriesForAdminAsync();
        }

        /// <summary>
        /// 新增分类
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPost]
        [Authorize]
        [Route("category")]
        [ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
        public async Task<ServiceResult> InsertCategoryAsync([FromBody] EditCategoryInput input)
        {
            return await _blogService.InsertCategoryAsync(input);
        }

        /// <summary>
        /// 更新分类
        /// </summary>
        /// <param name="id"></param>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPut]
        [Authorize]
        [Route("category")]
        [ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
        public async Task<ServiceResult> UpdateCategoryAsync([Required] int id, [FromBody] EditCategoryInput input)
        {
            return await _blogService.UpdateCategoryAsync(id, input);
        }

        /// <summary>
        /// 删除分类
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [HttpDelete]
        [Authorize]
        [Route("category")]
        [ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
        public async Task<ServiceResult> DeleteCategoryAsync([Required] int id)
        {
            return await _blogService.DeleteCategoryAsync(id);
        }

        #endregion Categories

        #region Tags

        /// <summary>
        /// 查询标签列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Authorize]
        [Route("admin/tags")]
        [Route("tags/admin")]
        [ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
        public async Task<ServiceResult<IEnumerable<QueryTagForAdminDto>>> QueryTagsForAdminAsync()
        {
            return await _blogService.QueryTagsForAdminAsync();
        }

        /// <summary>
        /// 新增标签
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPost]
        [Authorize]
        [Route("tag")]
        [ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
        public async Task<ServiceResult> InsertTagAsync([FromBody] EditTagInput input)
        {
            return await _blogService.InsertTagAsync(input);
        }

        /// <summary>
        /// 更新标签
        /// </summary>
        /// <param name="id"></param>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPut]
        [Authorize]
        [Route("tag")]
        [ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
        public async Task<ServiceResult> UpdateTagAsync([Required] int id, [FromBody] EditTagInput input)
        {
            return await _blogService.UpdateTagAsync(id, input);
        }

        /// <summary>
        /// 删除标签
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [HttpDelete]
        [Authorize]
        [Route("tag")]
        [ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
        public async Task<ServiceResult> DeleteTagAsync([Required] int id)
        {
            return await _blogService.DeleteTagAsync(id);
        }

        #endregion Tags

        #region FriendLinks

        /// <summary>
        /// 查询友链列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Authorize]
        [Route("admin/friendlinks")]
        [ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
        public async Task<ServiceResult<IEnumerable<QueryFriendLinkForAdminDto>>> QueryFriendLinksForAdminAsync()
        {
            return await _blogService.QueryFriendLinksForAdminAsync();
        }

        /// <summary>
        /// 新增友链
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPost]
        [Authorize]
        [Route("friendlink")]
        [ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
        public async Task<ServiceResult> InsertFriendLinkAsync([FromBody] EditFriendLinkInput input)
        {
            return await _blogService.InsertFriendLinkAsync(input);
        }

        /// <summary>
        /// 更新友链
        /// </summary>
        /// <param name="id"></param>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPut]
        [Authorize]
        [Route("friendlink")]
        [ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
        public async Task<ServiceResult> UpdateFriendLinkAsync([Required] int id, [FromBody] EditFriendLinkInput input)
        {
            return await _blogService.UpdateFriendLinkAsync(id, input);
        }

        /// <summary>
        /// 删除友链
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [HttpDelete]
        [Authorize]
        [Route("friendlink")]
        [ApiExplorerSettings(GroupName = Grouping.GroupName_v2)]
        public async Task<ServiceResult> DeleteFriendLinkAsync([Required] int id)
        {
            return await _blogService.DeleteFriendLinkAsync(id);
        }

        #endregion
    }
}