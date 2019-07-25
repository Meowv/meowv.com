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
        /// <param name="post"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> Insert(PostDto dto);

        /// <summary>
        /// 删除文章
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> Delete(int id);

        /// <summary>
        /// 更新文章
        /// </summary>
        /// <param name="id"></param>
        /// <param name="dto"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> Update(int id, PostDto dto);

        /// <summary>
        /// 获取文章
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        Task<ActionOutput<GetPostDto>> Get(string url);

        /// <summary>
        /// 分页查询文章列表
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<PagedResultDto<QueryPostDto>> Query(PagingInput input);
    }
}