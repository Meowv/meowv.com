using System.ComponentModel.DataAnnotations;

namespace Meowv.Blog.Application.Contracts
{
    /// <summary>
    /// 分页输入参数
    /// </summary>
    public class PagingInput
    {
        /// <summary>
        /// 页码
        /// </summary>
        [Range(1, int.MaxValue)]
        public int Page { get; set; } = 1;

        /// <summary>
        /// 限制条数
        /// </summary>
        [Range(10, 30)]
        public int Limit { get; set; } = 10;
    }
}