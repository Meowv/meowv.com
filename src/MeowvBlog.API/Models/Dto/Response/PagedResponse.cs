using System.Collections.Generic;

namespace MeowvBlog.API.Models.Dto.Response
{
    public class PagedResponse<T> : ListResultDto<T>, IPagedResult<T>
    {
        /// <summary>
        /// Constructor
        /// </summary>
        public PagedResponse() { }

        /// <summary>
        /// 总数
        /// </summary>
        public int Total { get; set; }

        /// <summary>
        /// Constructor
        /// </summary>
        /// <param name="total"></param>
        /// <param name="result"></param>
        public PagedResponse(int total, IReadOnlyList<T> result) : base(result)
        {
            Total = total;
        }
    }

    public interface IHasTotalCount
    {
        /// <summary>
        /// 总数
        /// </summary>
        int Total { get; set; }
    }

    public interface IListResult<T>
    {
        /// <summary>
        /// 结果
        /// </summary>
        IReadOnlyList<T> Result { get; set; }
    }

    public class ListResultDto<T> : IListResult<T>
    {
        /// <summary>
        /// Constructor
        /// </summary>
        public ListResultDto() { }

        private IReadOnlyList<T> result;

        public IReadOnlyList<T> Result
        {
            get => result ?? (result = new List<T>());
            set => result = value;
        }

        /// <summary>
        /// Constructor
        /// </summary>
        /// <param name="result"></param>
        public ListResultDto(IReadOnlyList<T> result) => Result = result;
    }

    public interface IPagedResult<T> : IListResult<T>, IHasTotalCount { }
}