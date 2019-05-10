using System;
using System.Collections.Generic;

namespace MeowvBlog.Dtos
{
    [Serializable]
    public class PagedResultDto<T> : ListResultDto<T>, IPagedResult<T>, IListResult<T>, IHasTotalCount, IDto
    {
        public int TotalCount { get; set; }

        public PagedResultDto()
        {
        }

        public PagedResultDto(int totalCount, IList<T> items)
            : base(items)
        {
            TotalCount = totalCount;
        }
    }
}