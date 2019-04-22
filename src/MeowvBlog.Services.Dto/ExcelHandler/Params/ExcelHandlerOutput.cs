using System.Collections.Generic;

namespace MeowvBlog.Services.Dto.ExcelHandler.Params
{
    /// <summary>
    /// Excel处理输出参数
    /// </summary>
    public class ExcelHandlerOutput
    {
        /// <summary>
        /// 区域列表
        /// </summary>
        public IList<ExcelHandlerDto> Areas { get; set; }
    }
}