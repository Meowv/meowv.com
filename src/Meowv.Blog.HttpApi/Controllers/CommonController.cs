using Meowv.Blog.Application.Common;
using Meowv.Blog.ToolKits.Base;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Threading.Tasks;
using Volo.Abp.AspNetCore.Mvc;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.HttpApi.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [ApiExplorerSettings(GroupName = Grouping.GroupName_v3)]
    public class CommonController : AbpController
    {
        private readonly ICommonService _commonService;

        public CommonController(ICommonService commonService)
        {
            _commonService = commonService;
        }

        /// <summary>
        /// 必应每日壁纸，返回图片URL
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("bing/imgUrl")]
        public async Task<ServiceResult<string>> GetBingImgUrlAsync()
        {
            return await _commonService.GetBingImgUrlAsync();
        }

        /// <summary>
        /// 必应每日壁纸，直接返回图片
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("bing/imgFile")]
        public async Task<FileContentResult> GetBingImgFileAsync()
        {
            var url = await _commonService.GetBingImgFileAsync();

            return File(url.Result, "image/jpeg");
        }

        /// <summary>
        /// 获取妹子图，返回URL列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("girls")]
        public async Task<ServiceResult<IEnumerable<string>>> GetGirlsAsync()
        {
            return await _commonService.GetGirlsAsync();
        }

        /// <summary>
        /// 获取一张妹子图，返回图片URL
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("girl/imgUrl")]
        public async Task<ServiceResult<string>> GetGirlImgUrlAsync()
        {
            return await _commonService.GetGirlImgUrlAsync();
        }

        /// <summary>
        /// 获取一张妹子图，直接返回图片
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("girl/imgFile")]
        public async Task<FileContentResult> GetGirlImgFileAsync()
        {
            var url = await _commonService.GetGirlImgFileAsync();

            return File(url.Result, "image/jpeg");
        }

        /// <summary>
        /// 获取猫图，返回URL列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("cats")]
        public async Task<ServiceResult<IEnumerable<string>>> GetCatsAsync()
        {
            return await _commonService.GetCatsAsync();
        }

        /// <summary>
        /// 获取一张猫图，返回图片URL
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("cat/imgUrl")]
        public async Task<ServiceResult<string>> GetCatImgUrlAsync()
        {
            return await _commonService.GetCatImgUrlAsync();
        }

        /// <summary>
        /// 获取一张猫图，直接返回图片
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("cat/imgFile")]
        public async Task<FileContentResult> GetCatImgFileAsync()
        {
            var url = await _commonService.GetCatImgFileAsync();

            return File(url.Result, "image/jpeg");
        }

        /// <summary>
        /// 根据IP地址获取所在区域
        /// </summary>
        /// <param name="ip"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("ip2region")]
        public async Task<ServiceResult<string>> Ip2ReginAsync(string ip)
        {
            return await _commonService.Ip2ReginAsync(ip);
        }

        /// <summary>
        /// 智能抠图，移除图片背景
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("removebg")]
        public async Task<FileContentResult> RemoveBgAsync([Required] string url)
        {
            var bytes = await _commonService.RemoveBgAsync(url);

            return File(bytes.Result, "image/png");
        }

        /// <summary>
        /// 智能抠图，移除图片背景
        /// </summary>
        /// <param name="file"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("removebg")]
        [Consumes("multipart/form-data")]
        public async Task<FileContentResult> RemoveBgAsync(IFormFile file)
        {
            var bytes = await _commonService.RemoveBgAsync(file);

            return File(bytes.Result, "image/png");
        }
    }
}