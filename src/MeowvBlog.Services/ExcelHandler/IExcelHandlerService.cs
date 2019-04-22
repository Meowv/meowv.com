using MeowvBlog.Services.Dto.Common;
using MeowvBlog.Services.Dto.ExcelHandler.Params;
using UPrime;

namespace MeowvBlog.Services.ExcelHandler
{
    /// <summary>
    /// Excel处理服务接口
    /// </summary>
    public interface IExcelHandlerService
    {
        /// <summary>
        /// 批处理Excel
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        ActionOutput<ExcelHandlerOutput> Batch(ExcelFileInput input);
    }
}