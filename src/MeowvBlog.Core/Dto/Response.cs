using System;

namespace MeowvBlog.Core.Dto
{
    public class Response
    {
        public string Msg { get; set; } = string.Empty;

        public bool Success => string.IsNullOrEmpty(Msg);

        public DateTime Timestamp { get; set; } = DateTime.Now;

        public void HandleException(Exception ex) => Msg = ex.InnerException?.StackTrace.ToString();
    }

    public class Response<TResult> : Response where TResult : class
    {
        public TResult Result { get; set; }
    }   
}