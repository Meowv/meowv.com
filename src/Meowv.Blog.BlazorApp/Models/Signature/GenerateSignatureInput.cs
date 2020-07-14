using System.ComponentModel.DataAnnotations;

namespace Meowv.Blog.BlazorApp.Models.Signature
{
    public class GenerateSignatureInput
    {
        /// <summary>
        /// 名字
        /// </summary>
        [Required]
        [MinLength(2)]
        [MaxLength(4)]
        public string Name { get; set; }

        /// <summary>
        /// 类型Id
        /// </summary>
        [Required]
        public int Id { get; set; }

        /// <summary>
        /// 时间戳
        /// </summary>
        [Required]
        public long Timestamp { get; set; }

        /// <summary>
        /// 验签
        /// </summary>
        [Required]
        public string Sign { get; set; }
    }
}