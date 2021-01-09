using System;
using System.ComponentModel.DataAnnotations;

namespace Meowv.Blog.Dto
{
    public class PagingInput
    {
        /// <summary>
        /// 页码
        /// </summary>
        [Range(1, 100)]
        public int Page { get; set; } = 1;

        /// <summary>
        /// 限制条数
        /// </summary>
        [Range(10, 100)]
        public int Limit { get; set; } = 10;
    }
}