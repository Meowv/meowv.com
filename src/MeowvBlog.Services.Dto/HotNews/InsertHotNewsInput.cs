using MeowvBlog.Services.Dto.HotNews;

namespace MeowvBlog.Services.Dto.HotNews
{
    public class InsertHotNewsInput : HotNewsDto
    {
        public int SourceId { get; set; }
    }
}