using MeowvBlog.Services.Dto;
using MeowvBlog.Services.Dto.Blog;
using Plus;
using Plus.Services.Dto;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Blog
{
    public partial interface IBlogService
    {
        /// <summary>
        /// 新增文章
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> InsertPost(PostForAdminDto dto);

        /// <summary>
        /// 删除文章
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> DeletePost(int id);

        /// <summary>
        /// 更新文章
        /// </summary>
        /// <param name="id"></param>
        /// <param name="dto"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> UpdatePost(int id, PostForAdminDto dto);

        /// <summary>
        /// 获取文章
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        Task<ActionOutput<GetPostDto>> GetPost(string url);

        /// <summary>
        /// 分页查询文章列表
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<PagedResultDto<QueryPostDto>> QueryPosts(PagingInput input);

        /// <summary>
        /// 通过标签查询文章列表
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        Task<IList<QueryPostDto>> QueryPostsByTag(string name);

        /// <summary>
        /// 通过分类查询文章列表
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        Task<IList<QueryPostDto>> QueryPostsByCategory(string name);

        /// <summary>
        /// 分页查询文章列表 For Admin
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<PagedResultDto<QueryPostForAdminDto>> QueryPostsForAdmin(PagingInput input);

        /// <summary>
        /// 根据Id获取文章详细数据
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        Task<ActionOutput<GetPostForAdminDto>> GetPostForAdmin(int id);

        /// <summary>
        /// 查询所有文章RSS
        /// </summary>
        /// <returns></returns>
        Task<IList<PostRssDto>> QueryPostRss();
    }
}