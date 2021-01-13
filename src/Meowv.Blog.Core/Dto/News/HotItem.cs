namespace Meowv.Blog.Dto.News
{
    public class HotItem<TResult>
    {
        public string Source { get; set; }

        public TResult Result { get; set; }
    }
}