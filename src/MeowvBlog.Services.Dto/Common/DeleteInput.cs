using System.ComponentModel.DataAnnotations;

namespace MeowvBlog.Services.Dto.Common
{
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