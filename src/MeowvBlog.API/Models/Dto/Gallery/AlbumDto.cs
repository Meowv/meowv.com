namespace MeowvBlog.API.Models.Dto.Gallery
{
    public class AlbumDto
    {
        public string Name { get; set; }

        public string ImgUrl { get; set; }

        public bool IsPublic { get; set; }

        public string Password { get; set; }
    }
}