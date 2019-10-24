using MeowvBlog.Core;
using MeowvBlog.Core.Domain.Signature;
using MeowvBlog.Core.Dto;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;
using Extension = MeowvBlog.API.Extensions.Extensions;

namespace MeowvBlog.API.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Produces("application/json")]
    [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v3)]
    public class SignatureController : ControllerBase
    {
        private readonly IHttpClientFactory _httpClient;
        private readonly MeowvBlogDBContext _context;

        public SignatureController(IHttpClientFactory httpClient, MeowvBlogDBContext context)
        {
            _httpClient = httpClient;
            _context = context;
        }

        /// <summary>
        /// 获取所有签名的类型
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("type")]
        [ResponseCache(CacheProfileName = "default")]
        public async Task<Response<IList<EnumResponse>>> GetSignatureTypeAsync()
        {
            var response = new Response<IList<EnumResponse>>();
            var result = Extension.EnumToList<SignatureEnum>();
            response.Result = result;
            return await Task.FromResult(response);
        }
    }
}