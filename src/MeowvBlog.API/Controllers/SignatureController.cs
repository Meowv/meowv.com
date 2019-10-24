using MeowvBlog.Core;
using MeowvBlog.Core.Domain.Signature;
using MeowvBlog.Core.Dto;
using MeowvBlog.Core.Dto.Signature;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Linq;
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

        /// <summary>
        /// 获取个性签名记录
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("logs")]
        [ResponseCache(CacheProfileName = "default")]
        public async Task<Response<IList<SignatureLogDto>>> GetSignatureLogAsync()
        {
            var response = new Response<IList<SignatureLogDto>>();

            var signatureLogs = await _context.SignatureLogs.OrderByDescending(x => x.Date).Take(20).Select(x => new SignatureLogDto
            {
                Name = x.Name.Substring(0, 1) + "**",
                Type = x.Type,
                Url = x.Url,
                Ip = x.Ip,
                Date = x.Date.ToString("yyyy-MM-dd HH:mm:ss")
            }).ToListAsync();

            response.Result = signatureLogs;
            return response;
        }
    }
}