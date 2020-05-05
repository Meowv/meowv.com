using Meowv.Blog.ToolKits.Base;
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
    }
}