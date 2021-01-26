namespace Meowv.Blog.Response
{
    public class BlogResponse<TResult> : BlogResponse where TResult : class
    {
        public TResult Result { get; set; }

        public void IsSuccess(TResult result = null, string message = "")
        {
            Code = BlogResponseCode.Succeed;
            Message = message;
            Result = result;
        }
    }
}