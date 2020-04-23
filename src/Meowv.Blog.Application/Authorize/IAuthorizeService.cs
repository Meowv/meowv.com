using Meowv.Blog.ToolKits.Base;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Authorize
{
    public interface IAuthorizeService
    {
        /// <summary>
        /// 获取登录地址(GitHub)
        /// </summary>
        /// <returns></returns>
        Task<ServiceResult<string>> GetLoginAddressAsync();
    }
}