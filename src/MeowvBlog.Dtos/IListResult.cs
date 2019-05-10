using System.Collections.Generic;

namespace MeowvBlog.Dtos
{
    public interface IListResult<T>
    {
        IList<T> Items { get; set; }
    }
}