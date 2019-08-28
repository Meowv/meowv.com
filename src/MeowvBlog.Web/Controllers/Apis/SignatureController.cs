using MeowvBlog.Services.Dto.Signature;
using MeowvBlog.Services.Signature;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plus;
using Plus.WebApi;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace MeowvBlog.Web.Controllers.Apis
{
    [Route("api/[controller]")]
    [AllowAnonymous]
    [ApiController]
    public class SignatureController : ControllerBase
    {
        private readonly ISignatureService _signService;
        private readonly ISignatureLogService _signatureLogService;

        public SignatureController()
        {
            _signService = PlusEngine.Instance.Resolve<ISignatureService>();
            _signatureLogService = PlusEngine.Instance.Resolve<ISignatureLogService>();
        }

        /// <summary>
        /// 获取所有签名的类型
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("type")]
        [ResponseCache(CacheProfileName = "default", Duration = 600)]
        public async Task<IList<NameValue<int>>> GetSignatureType()
        {
            return await _signService.GetSignatureType();
        }

        /// <summary>
        /// 获取签名
        /// </summary>
        /// <param name="name">名字</param>
        /// <param name="id">签名类型</param>
        /// <param name="from"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("")]
        public async Task<IActionResult> GetSignature(string name, int id, string from = "")
        {
            if (name.Length > 4)
            {
                return BadRequest("名字只支持1-4个字符");
            }

            var ip = HttpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault();
            if (ip.IsNullOrEmpty())
            {
                ip = Request.HttpContext.Connection.RemoteIpAddress.ToString();
            }

            var url = await _signService.GetSignature(name, id, ip, from);

            return Ok(new { result = url });
        }

        /// <summary>
        /// 获取最近的个性签名记录
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("recently_logs")]
        public async Task<Response<IList<SignatureLogDto>>> GetRecentlySignatureLog()
        {
            var response = new Response<IList<SignatureLogDto>>();

            var result = await _signatureLogService.GetRecentlySignatureLog();
            if (!result.Success)
                response.SetMessage(ResponseStatusCode.Error, result.GetErrorMessage());
            else
                response.Result = result.Result;
            return response;
        }
    }
}