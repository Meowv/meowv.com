using Meowv.Blog.ToolKits.Base;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Caching.Common
{
    public interface ICommonCacheService
    {
        /// <summary>
        /// 获取必应每日壁纸，返回图片URL
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        Task<ServiceResult<string>> GetBingImgUrlAsync(Func<Task<ServiceResult<string>>> factory);

        /// <summary>
        /// 获取必应每日壁纸，直接返回图片
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        Task<ServiceResult<byte[]>> GetBingImgFileAsync(Func<Task<ServiceResult<byte[]>>> factory);

        /// <summary>
        /// 获取妹子图，返回URL列表
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<string>>> GetGirlsAsync(Func<Task<ServiceResult<IEnumerable<string>>>> factory);

        /// <summary>
        /// 获取妹子图，直接返回图片
        /// </summary>
        /// <param name="url"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        Task<ServiceResult<byte[]>> GetGirlImgFileAsync(string url, Func<Task<ServiceResult<byte[]>>> factory);

        /// <summary>
        /// 获取一张猫图，返回URL列表
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<string>>> GetCatsAsync(Func<Task<ServiceResult<IEnumerable<string>>>> factory);

        /// <summary>
        /// 获取一张猫图，直接返回图片
        /// </summary>
        /// <param name="url"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        Task<ServiceResult<byte[]>> GetCatImgFileAsync(string url, Func<Task<ServiceResult<byte[]>>> factory);

        /// <summary>
        /// 根据IP地址获取所在区域
        /// </summary>
        /// <param name="ip"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        Task<ServiceResult<List<string>>> Ip2ReginAsync(string ip, Func<Task<ServiceResult<List<string>>>> factory);

        /// <summary>
        /// 语音合成
        /// </summary>
        /// <param name="content"></param>
        /// <param name="spd"></param>
        /// <param name="pit"></param>
        /// <param name="vol"></param>
        /// <param name="per"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        Task<ServiceResult<byte[]>> SpeechTtsAsync(string content, int spd, int pit, int vol, int per, Func<Task<ServiceResult<byte[]>>> factory);

        /// <summary>
        /// 语音合成欢迎词
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        Task<ServiceResult<byte[]>> SpeechTtsGreetWordAsync(Func<Task<ServiceResult<byte[]>>> factory);
    }
}