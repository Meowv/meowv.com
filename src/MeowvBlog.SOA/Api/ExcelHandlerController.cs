using MeowvBlog.Services.Dto.Common;
using MeowvBlog.Services.Dto.ExcelHandler.Params;
using MeowvBlog.Services.ExcelHandler;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using UPrime;
using UPrime.WebApi;

namespace MeowvBlog.SOA.Api
{
    /// <summary>
    /// Excel处理API
    /// </summary>
    [Route("Excel")]
    public class ExcelHandlerController : ApiControllerBase
    {
        private readonly IExcelHandlerService _excelHandlerService;

        public ExcelHandlerController()
        {
            _excelHandlerService = UPrimeEngine.Instance.Resolve<IExcelHandlerService>();
        }

        /// <summary>
        /// 批处理Excel
        /// </summary>
        /// <param name="input"></param>
        /// <returns><see cref="ExcelHandlerOutput.Areas"/></returns>
        [HttpPost]
        [Route("Batch")]
        [AllowAnonymous]
        public UPrimeResponse<ExcelHandlerOutput> Batch(ExcelFileInput input)
        {
            var response = new UPrimeResponse<ExcelHandlerOutput>();

            var result = _excelHandlerService.Batch(input);
            if (!result.Success)
                response.SetMessage(UPrimeResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;

            return response;
        }
    }
}