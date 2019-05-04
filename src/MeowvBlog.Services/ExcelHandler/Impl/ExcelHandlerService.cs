using MeowvBlog.Core.Domain;
using MeowvBlog.Services.Dto.Common;
using MeowvBlog.Services.Dto.ExcelHandler;
using MeowvBlog.Services.Dto.ExcelHandler.Params;
using OfficeOpenXml;
using System.Collections.Generic;
using System.Text;
using UPrime;

namespace MeowvBlog.Services.ExcelHandler.Impl
{
    /// <summary>
    /// Excel处理服务接口实现
    /// </summary>
    public class ExcelHandlerService : ServiceBase, IExcelHandlerService
    {
        /// <summary>
        /// 批处理Excel
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public ActionOutput<ExcelHandlerOutput> Batch(ExcelFileInput input)
        {
            var output = new ActionOutput<ExcelHandlerOutput>();

            if (!input.ExcelFile.FileName.Contains(".xls"))
            {
                output.AddError(GlobalConsts.PARAMETER_ERROR);
                return output;
            }

            using (var package = new ExcelPackage(input.ExcelFile.OpenReadStream()))
            {
                var sheetCount = package.Workbook.Worksheets.Count;
                if (sheetCount <= 0)
                {
                    output.AddError(GlobalConsts.NONE_DATA);
                    return output;
                }

                var list = new List<ExcelHandlerDto>();

                for (int i = 0; i < sheetCount; i++)
                {
                    var area = new StringBuilder();
                    area.AppendLine("已投区域，欢迎抽查：");

                    var worksheet = package.Workbook.Worksheets[i];
                    var place = worksheet.Name;

                    var rows = worksheet.Dimension.Rows;
                    for (int j = 1; j <= rows; j++)
                    {
                        var item = worksheet.Cells[j, 2].Value.ToString();
                        area.AppendLine(item);
                    }

                    var dto = new ExcelHandlerDto
                    {
                        Place = place,
                        Area = area.ToString().UrlDecode()
                    };
                    list.Add(dto);
                }

                output.Result = new ExcelHandlerOutput { Areas = list };
            }
            return output;
        }
    }
}