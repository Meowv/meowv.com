using System.Collections.Generic;

namespace Meowv.Blog.ToolKits.Base.Paged
{
    public class ListResult<T> : IListResult<T>
    {
        IReadOnlyList<T> result;

        public IReadOnlyList<T> Result
        {
            get => result ?? (result = new List<T>());
            set => result = value;
        }

        public ListResult()
        {
        }

        public ListResult(IReadOnlyList<T> result)
        {
            Result = result;
        }
    }
}