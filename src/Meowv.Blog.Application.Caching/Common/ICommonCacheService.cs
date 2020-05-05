using Meowv.Blog.ToolKits.Base;
using System;
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
    }
}