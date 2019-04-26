using System.ComponentModel.DataAnnotations;

namespace MeowvBlog.Services.Dto.Categories.Params
{
    /// <summary>
    /// 更新分类输入参数
    /// </summary>
    public class UpdateCategoryInput : CategoryDto
    {
        /// <summary>
        /// 分类Id
        /// </summary>
        [Required]
        [Range(1, int.MaxValue)]
        public int CategoryId { get; set; }
    }
}