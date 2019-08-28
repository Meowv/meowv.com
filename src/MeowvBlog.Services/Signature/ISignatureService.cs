using Plus;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Signature
{
    public interface ISignatureService
    {
        /// <summary>
        /// 获取所有签名的类型
        /// </summary>
        /// <returns></returns>
        Task<IList<NameValue<int>>> GetSignatureType();

        /// <summary>
        /// 获取签名
        /// </summary>
        /// <param name="name"></param>
        /// <param name="id"></param>
        /// <param name="ip"></param>
        /// <param name="from"></param>
        /// <returns></returns>
        Task<string> GetSignature(string name, int id, string ip, string from = "");
    }
}