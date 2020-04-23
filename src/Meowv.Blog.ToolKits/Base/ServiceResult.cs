using Meowv.Blog.ToolKits.Base.Enum;
using System;

namespace Meowv.Blog.ToolKits.Base
{
    /// <summary>
    /// 服务层响应实体
    /// </summary>
    public class ServiceResult
    {
        /// <summary>
        /// 响应码
        /// </summary>
        public ServiceResultCode ResultCode { set; get; }

        /// <summary>
        /// 异常
        /// </summary>
        public Exception Exception { get; set; }

        /// <summary>
        /// 数据
        /// </summary>
        public object Data { get; set; }

        /// <summary>
        /// 成功
        /// </summary>
        public bool Success => ResultCode == ServiceResultCode.Succeed;

        /// <summary>
        /// 错误
        /// </summary>
        public bool Error => ResultCode == ServiceResultCode.Error;

        /// <summary>
        /// 失败
        /// </summary>
        public bool Failed => ResultCode == ServiceResultCode.Error || ResultCode == ServiceResultCode.Failed;

        private string _message;

        /// <summary>
        /// 响应信息
        /// </summary>
        public string Message
        {
            set => _message = value;
            get
            {
                if (!string.IsNullOrEmpty(_message))
                {
                    return _message;
                }
                if (Exception != null)
                {
                    return Exception.Message;
                }

                return null;
            }
        }

        public ServiceResult()
        {
        }

        public ServiceResult(ServiceResultCode resultCode)
        {
            ResultCode = resultCode;
        }

        public ServiceResult(string message, ServiceResultCode resultCode)
        {
            Message = message;
            ResultCode = resultCode;
        }

        public ServiceResult(Exception exception, ServiceResultCode resultCode)
        {
            Exception = exception;
            ResultCode = resultCode;
        }

        public ServiceResult(Exception exception, string message, ServiceResultCode resultCode, object data)
        {
            Exception = exception;
            Message = message;
            ResultCode = resultCode;
            Data = data;
        }

        /// <summary>
        /// 响应成功
        /// </summary>
        /// <param name="message"></param>
        /// <param name="data"></param>
        /// <returns></returns>
        public static ServiceResult IsSuccess(string message, object data = null)
        {
            return new ServiceResult(message, ServiceResultCode.Succeed) { Data = data };
        }

        /// <summary>
        /// 响应错误
        /// </summary>
        /// <param name="exexception></param>
        /// <param name="data"></param>
        /// <returns></returns>
        public static ServiceResult IsError(Exception exception, object data = null)
        {
            return new ServiceResult(exception, ServiceResultCode.Error) { Data = data };
        }

        /// <summary>
        /// 响应错误
        /// </summary>
        /// <param name="message"></param>
        /// <param name="data"></param>
        /// <returns></returns>
        public static ServiceResult IsError(string message, object data = null)
        {
            return new ServiceResult(message, ServiceResultCode.Error) { Data = data };
        }

        /// <summary>
        /// 响应失败
        /// </summary>
        /// <param name="message"></param>
        /// <param name="data"></param>
        /// <returns></returns>
        public static ServiceResult IsFailed(string message, object data = null)
        {
            return new ServiceResult(message, ServiceResultCode.Failed) { Data = data };
        }
    }
}