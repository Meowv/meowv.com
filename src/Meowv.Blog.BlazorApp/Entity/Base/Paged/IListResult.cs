using System.Collections.Generic;

namespace Meowv.Blog.BlazorApp.Entity.Base.Paged
{
    public interface IListResult<T>
    {
        /// <summary>
        /// 返回结果
        /// </summary>
        IReadOnlyList<T> Item { get; set; }
    }
}