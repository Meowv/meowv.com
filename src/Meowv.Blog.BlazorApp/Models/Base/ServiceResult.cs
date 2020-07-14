using Meowv.Blog.BlazorApp.Models.Base.Enum;
using System;

namespace Meowv.Blog.BlazorApp.Models.Base
{
    /// <summary>
    /// 服务层响应实体
    /// </summary>
    public class ServiceResult
    {
        /// <summary>
        /// 响应码
        /// </summary>
        public ServiceResultCode Code { get; set; }

        /// <summary>
        /// 响应信息
        /// </summary>
        public string Message { get; set; }

        /// <summary>
        /// 成功
        /// </summary>
        public bool Success => Code == ServiceResultCode.Succeed;

        /// <summary>
        /// 时间戳(毫秒)
        /// </summary>
        public long Timestamp { get; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        /// <summary>
        /// 响应成功
        /// </summary>
        /// <param name="message"></param>
        /// <param name="data"></param>
        /// <returns></returns>
        public void IsSuccess(string message = "")
        {
            Message = message;
            Code = ServiceResultCode.Succeed;
        }

        /// <summary>
        /// 响应失败
        /// </summary>
        /// <param name="message"></param>
        /// <param name="data"></param>
        /// <returns></returns>
        public void IsFailed(string message = "")
        {
            Message = message;
            Code = ServiceResultCode.Failed;
        }

        /// <summary>
        /// 响应失败
        /// </summary>
        /// <param name="exexception></param>
        /// <param name="data"></param>
        /// <returns></returns>
        public void IsFailed(Exception exception)
        {
            Message = exception.InnerException?.StackTrace;
            Code = ServiceResultCode.Failed;
        }
    }
}