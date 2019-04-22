using Microsoft.AspNetCore.Http;
using System.ComponentModel.DataAnnotations;

namespace MeowvBlog.Services.Dto.Common
{
    /// <summary>
    /// ExcelFile输入参数
    /// </summary>
    public class ExcelFileInput
    {
        /// <summary>
        /// Excel文件
        /// </summary>
        [Required]
        public IFormFile ExcelFile { get; set; }
    }
}