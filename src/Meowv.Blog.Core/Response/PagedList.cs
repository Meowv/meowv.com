using System.Collections.Generic;

namespace Meowv.Blog.Response
{
    public class PagedList<T> : ListResult<T>, IPagedList<T>
    {
        public int Total { get; set; }

        public PagedList(int total, IReadOnlyList<T> result) : base(result)
        {
            Total = total;
        }
    }
}