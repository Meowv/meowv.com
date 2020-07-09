using Meowv.Blog.Application.Common;
using Meowv.Blog.Application.Contracts.Common;
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
        public async Task<ServiceResult<List<string>>> Ip2ReginAsync(string ip)
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

        /// <summary>
        /// 语音合成
        /// </summary>
        /// <param name="content">合成的文本，长度在1024字节以内</param>
        /// <param name="spd">语速，取值0-9，默认为5中语速</param>
        /// <param name="pit">音调，取值0-9，默认为5中语调</param>
        /// <param name="vol">音量，取值0-15，默认为5中音量</param>
        /// <param name="per">发音人, 0为女声，1为男声，3为情感合成-度逍遥，4为情感合成-度丫丫</param>
        /// <returns></returns>
        [HttpGet]
        [Route("tts")]
        public async Task<FileContentResult> SpeechTtsAsync([Required] string content, [Range(0, 9)] int spd = 5, [Range(0, 9)] int pit = 5, [Range(0, 15)] int vol = 7, [Range(0, 4)] int per = 4)
        {
            var bytes = await _commonService.SpeechTtsAsync(content, spd, pit, vol, per);

            return File(bytes.Result, "audio/mpeg");
        }

        /// <summary>
        /// 语音合成欢迎词
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("tts/GreetWord")]
        public async Task<FileContentResult> SpeechTtsGreetWordAsync()
        {
            var bytes = await _commonService.SpeechTtsGreetWordAsync();

            return File(bytes.Result, "audio/mpeg");
        }

        /// <summary>
        /// 根据条件查询 Emoji 表情列表
        /// </summary>
        /// <param name="category"></param>
        /// <param name="keyword"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("emojis")]
        public async Task<ServiceResult<IEnumerable<EmojiDto>>> QueryEmojisAsync(string category, string keyword)
        {
            return await _commonService.QueryEmojisAsync(category, keyword);
        }

        /// <summary>
        /// 返回图片
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("img")]
        public async Task<FileContentResult> ReturnImgAsync(string url)
        {
            var bytes = await _commonService.ReturnImgAsync(url);

            return File(bytes.Result, "image/png");
        }
    }
}