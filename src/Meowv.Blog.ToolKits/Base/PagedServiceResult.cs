using Meowv.Blog.ToolKits.Base.Paged;
using System.Collections.Generic;

namespace Meowv.Blog.ToolKits.Base
{
    /// <summary>
    /// 分页响应实体
    /// </summary>
    /// <typeparam name="T"></typeparam>
    public class PagedServiceResult<T> : ListResult<T>, IPagedServiceResult<T>
    {
        /// <summary>
        /// 总数
        /// </summary>
        public int Total { get; set; }

        public PagedServiceResult()
        {
        }

        public PagedServiceResult(int total, IReadOnlyList<T> result) : base(result)
        {
            Total = total;
        }
    }
}