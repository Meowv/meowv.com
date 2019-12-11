namespace MeowvBlog.API.Models.Dto.Gallery
{
    public class ImageForQueryDto
    {
        /// <summary>
        /// 图片URL
        /// </summary>
        public string ImgUrl { get; set; }

        /// <summary>
        /// 宽
        /// </summary>
        public int Width { get; set; }

        /// <summary>
        /// 高
        /// </summary>
        public int Height { get; set; }
    }
}