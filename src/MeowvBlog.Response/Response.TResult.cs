namespace MeowvBlog.Response
{
    public class Response<TResult> : Response where TResult : class
    {
        public TResult Result { get; set; }
    }
}