using System.ComponentModel.DataAnnotations;

namespace MeowvBlog.Services.Dto.Tags.Params
{
    public class UpdateTagInput : TagDto
    {
        /// <summary>
        /// 标签Id
        /// </summary>
        [Required]
        [Range(1, int.MaxValue)]
        public int TagId { get; set; }
    }
}