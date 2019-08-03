using Plus;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Sign
{
    public interface ISignService
    {
        /// <summary>
        /// 获取所有签名的类型
        /// </summary>
        /// <returns></returns>
        Task<IList<NameValue<int>>> GetSignType();
    }
}