using Meowv.Blog.Application.Contracts.Common;
using Meowv.Blog.ToolKits.Base;
using Microsoft.AspNetCore.Http;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Common
{
    public interface ICommonService
    {
        /// <summary>
        /// 获取必应每日壁纸，返回图片URL
        /// </summary>
        /// <returns></returns>
        Task<ServiceResult<string>> GetBingImgUrlAsync();

        /// <summary>
        /// 获取必应每日壁纸，直接返回图片
        /// </summary>
        /// <returns></returns>
        Task<ServiceResult<byte[]>> GetBingImgFileAsync();

        /// <summary>
        /// 获取妹子图，返回URL列表
        /// </summary>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<string>>> GetGirlsAsync();

        /// <summary>
        /// 获取一张妹子图，返回图片URL
        /// </summary>
        /// <returns></returns>
        Task<ServiceResult<string>> GetGirlImgUrlAsync();

        /// <summary>
        /// 获取一张妹子图，直接返回图片
        /// </summary>
        /// <returns></returns>
        Task<ServiceResult<byte[]>> GetGirlImgFileAsync();

        /// <summary>
        /// 获取猫图，返回URL列表
        /// </summary>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<string>>> GetCatsAsync();

        /// <summary>
        /// 获取一张猫图，返回图片URL
        /// </summary>
        /// <returns></returns>
        Task<ServiceResult<string>> GetCatImgUrlAsync();

        /// <summary>
        /// 获取一张猫图，直接返回图片
        /// </summary>
        /// <returns></returns>
        Task<ServiceResult<byte[]>> GetCatImgFileAsync();

        /// <summary>
        /// 根据IP地址获取所在区域
        /// </summary>
        /// <param name="ip"></param>
        /// <returns></returns>
        Task<ServiceResult<List<string>>> Ip2ReginAsync(string ip);

        /// <summary>
        /// 智能抠图，移除图片背景
        /// </summary>
        /// <param name="file"></param>
        /// <returns></returns>
        Task<ServiceResult<byte[]>> RemoveBgAsync(IFormFile file);

        /// <summary>
        /// 智能抠图，移除图片背景
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        Task<ServiceResult<byte[]>> RemoveBgAsync(string url);

        /// <summary>
        /// 语音合成
        /// </summary>
        /// <param name="content">合成的文本，长度在1024字节以内</param>
        /// <param name="spd">语速，取值0-9，默认为5中语速</param>
        /// <param name="pit">音调，取值0-9，默认为5中语调</param>
        /// <param name="vol">音量，取值0-15，默认为5中音量</param>
        /// <param name="per">发音人, 0为女声，1为男声，3为情感合成-度逍遥，4为情感合成-度丫丫</param>
        /// <returns></returns>
        Task<ServiceResult<byte[]>> SpeechTtsAsync(string content, int spd, int pit, int vol, int per);

        /// <summary>
        /// 语音合成欢迎词
        /// </summary>
        /// <returns></returns>
        Task<ServiceResult<byte[]>> SpeechTtsGreetWordAsync();

        /// <summary>
        /// 根据条件查询 Emoji 表情列表
        /// </summary>
        /// <param name="category"></param>
        /// <param name="keyword"></param>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<EmojiDto>>> QueryEmojisAsync(string category, string keyword);

        /// <summary>
        /// 返回图片
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        Task<ServiceResult<byte[]>> ReturnImgAsync(string url);
    }
}