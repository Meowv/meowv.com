using Meowv.Blog.Application.Contracts;
using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.ToolKits.Base;
using Meowv.Blog.ToolKits.Extensions;
using System.Linq;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Blog.Impl
{
    public partial class BlogService
    {
        /// <summary>
        /// 分页查询文章列表
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ServiceResult<PagedList<QueryPostDto>>> QueryPostsAsync(PagingInput input)
        {
            return await _blogCacheService.QueryPostsAsync(input, async () =>
            {
                var result = new ServiceResult<PagedList<QueryPostDto>>();

                var count = await _postRepository.GetCountAsync();

                var list = _postRepository.OrderByDescending(x => x.CreationTime)
                                          .PageByIndex(input.Page, input.Limit)
                                          .Select(x => new PostBriefDto
                                          {
                                              Title = x.Title,
                                              Url = x.Url,
                                              Year = x.CreationTime.Year,
                                              CreationTime = x.CreationTime.TryToDateTime()
                                          }).GroupBy(x => x.Year)
                                          .Select(x => new QueryPostDto
                                          {
                                              Year = x.Key,
                                              Posts = x.ToList()
                                          }).ToList();

                result.IsSuccess(new PagedList<QueryPostDto>(count.TryToInt(), list));
                return result;
            });
        }
    }
}