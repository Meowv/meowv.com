namespace Meowv.Blog.Application.Contracts.Gallery
{
    public class ImageDto
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