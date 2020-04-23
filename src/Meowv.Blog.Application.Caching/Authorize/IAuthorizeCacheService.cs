using Meowv.Blog.ToolKits.Base;
using System;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Caching.Authorize
{
    public interface IAuthorizeCacheService
    {
        /// <summary>
        /// 获取登录地址(GitHub)
        /// </summary>
        /// <returns></returns>
        Task<ServiceResult<string>> GetLoginAddressAsync(Func<Task<ServiceResult<string>>> factory);
    }
}