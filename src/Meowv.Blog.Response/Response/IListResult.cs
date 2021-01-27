using System.Collections.Generic;

namespace Meowv.Blog.Response
{
    public interface IListResult<T>
    {
        IReadOnlyList<T> Item { get; set; }
    }
}