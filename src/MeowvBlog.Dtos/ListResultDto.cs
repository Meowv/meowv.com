using System;
using System.Collections.Generic;

namespace MeowvBlog.Dtos
{
    [Serializable]
    public class ListResultDto<T> : IListResult<T>
    {
        private IList<T> _items;

        public IList<T> Items
        {
            get
            {
                return _items ?? (_items = new List<T>());
            }
            set
            {
                _items = value;
            }
        }

        public ListResultDto()
        {
        }

        public ListResultDto(IList<T> items)
        {
            Items = items;
        }
    }
}