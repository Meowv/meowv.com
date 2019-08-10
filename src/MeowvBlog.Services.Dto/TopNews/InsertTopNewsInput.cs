using MeowvBlog.Services.Dto.HotNews;

namespace MeowvBlog.Services.Dto.TopNews
{
    public class InsertTopNewsInput : HotNewsDto
    {
        public int SourceId { get; set; }
    }
}