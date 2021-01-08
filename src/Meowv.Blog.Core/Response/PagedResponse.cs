using System.Collections.Generic;

namespace Meowv.Blog.Response
{
    public class PagedResponse<T> : ListResult<T>, IPagedResponse<T>
    {
        public int Total { get; set; }

        public PagedResponse(int total, IReadOnlyList<T> result) : base(result)
        {
            Total = total;
        }
    }
}