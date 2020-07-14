using Meowv.Blog.BlazorApp.Models.Base.Enum;

namespace Meowv.Blog.BlazorApp.Models.Base
{
    /// <summary>
    /// 服务层响应实体(泛型)
    /// </summary>
    /// <typeparam name="T"></typeparam>
    public class ServiceResult<T> : ServiceResult where T : class
    {
        /// <summary>
        /// 返回结果
        /// </summary>
        public T Result { get; set; }

        /// <summary>
        /// 响应成功
        /// </summary>
        /// <param name="result"></param>
        /// <param name="message"></param>
        public void IsSuccess(T result = null, string message = "")
        {
            Message = message;
            Code = ServiceResultCode.Succeed;
            Result = result;
        }
    }
}