namespace MeowvBlog.Core.Dto.Gallery
{
    public class AlbumForQueryDto
    {
        public string Id { get; set; }

        public int Count { get; set; }

        public string Name { get; set; }

        public string ImgUrl { get; set; }

        public bool IsPublic { get; set; }
    }
}