using System.ComponentModel.DataAnnotations;

namespace MeowvBlog.Services.Dto.Common
{
    /// <summary>
    /// 删除数据输入参数
    /// </summary>
    public class DeleteInput
    {
        /// <summary>
        /// 主键编号
        /// </summary>
        [Required]
        [Range(1, int.MaxValue)]
        public int Id { get; set; }
    }
}