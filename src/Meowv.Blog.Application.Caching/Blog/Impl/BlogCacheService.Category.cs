using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.ToolKits.Base;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.Application.Caching.Blog.Impl
{
    public partial class BlogCacheService
    {
        private const string KEY_QueryCategories = "Blog:Category:QueryCategories";

        /// <summary>
        /// 查询分类列表
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<QueryCategoryDto>>> QueryCategoriesAsync(Func<Task<ServiceResult<IEnumerable<QueryCategoryDto>>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_QueryCategories, factory, CacheStrategy.ONE_DAY);
        }
    }
}