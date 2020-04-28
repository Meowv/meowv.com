using Meowv.Blog.Application.Contracts.Signature;
using Meowv.Blog.Application.Contracts.Signature.Params;
using Meowv.Blog.Application.Signature;
using Meowv.Blog.ToolKits.Base;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.AspNetCore.Mvc;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.HttpApi.Controllers
{
    [ApiController]
    [AllowAnonymous]
    [Route("[controller]")]
    [ApiExplorerSettings(GroupName = Grouping.GroupName_v3)]
    public class SignatureController : AbpController
    {
        private readonly ISignatureService _signatureService;

        public SignatureController(ISignatureService signatureService)
        {
            _signatureService = signatureService;
        }

        /// <summary>
        /// 生成个性艺术签名
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpGet]
        public async Task<ServiceResult<string>> GenerateSignatureAsync([FromQuery] GenerateSignatureInput input)
        {
            return await _signatureService.GenerateSignatureAsync(input);
        }

        /// <summary>
        /// 生成个性艺术签名
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPost]
        public async Task<ServiceResult<string>> GenerateSignatureForPostAsync([FromBody] GenerateSignatureInput input)
        {
            return await _signatureService.GenerateSignatureAsync(input);
        }

        /// <summary>
        /// 获取个性签名调用记录
        /// </summary>
        /// <param name="count"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("/signatures")]
        public async Task<ServiceResult<IEnumerable<SignatureDto>>> GetSignaturesAsync(int count)
        {
            return await _signatureService.GetSignaturesAsync(count);
        }

        /// <summary>
        /// 获取所有签名类型
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("types")]
        public async Task<ServiceResult<IEnumerable<EnumResponse>>> GetSignatureTypesAsync()
        {
            return await _signatureService.GetSignatureTypesAsync();
        }
    }
}