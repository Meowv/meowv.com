using System;

namespace Meowv.Blog.Response
{
    public class BlogResponse
    {
        public BlogResponseCode Code { get; set; }

        public string Message { get; set; } = string.Empty;

        public bool Success => Code == BlogResponseCode.Succeed;

        public void IsSuccess(string message = "")
        {
            Code = BlogResponseCode.Succeed;
            Message = message;
        }

        public void IsFailed(string message = "")
        {
            Code = BlogResponseCode.Failed;
            Message = message;
        }

        public void IsFailed(Exception exception)
        {
            Code = BlogResponseCode.Failed;
            Message = exception.InnerException?.StackTrace;
        }
    }
}