using System.Collections.Generic;

namespace MeowvBlog.API.Models.Dto.Response
{
    public class PagedResponse<T> : ListResultDto<T>, IPagedResult<T>
    {
        public PagedResponse() { }

        public int Total { get; set; }

        public PagedResponse(int total, IReadOnlyList<T> result) : base(result)
        {
            Total = total;
        }
    }

    public interface IHasTotalCount
    {
        int Total { get; set; }
    }

    public interface IListResult<T>
    {
        IReadOnlyList<T> Result { get; set; }
    }

    public class ListResultDto<T> : IListResult<T>
    {
        public ListResultDto() { }

        private IReadOnlyList<T> result;

        public IReadOnlyList<T> Result
        {
            get => result ?? (result = new List<T>());
            set => result = value;
        }

        public ListResultDto(IReadOnlyList<T> result) => Result = result;
    }

    public interface IPagedResult<T> : IListResult<T>, IHasTotalCount { }
}