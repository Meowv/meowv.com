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
        Task<ServiceResult<string>> Ip2ReginAsync(string ip);

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
    }
}