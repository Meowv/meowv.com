namespace MeowvBlog.API.Models.Dto.Gallery
{
    public class AlbumDto
    {
        /// <summary>
        /// 名称
        /// </summary>
        public string Name { get; set; }

        /// <summary>
        /// 图片URL
        /// </summary>
        public string ImgUrl { get; set; }

        /// <summary>
        /// 是否公开
        /// </summary>
        public bool IsPublic { get; set; }

        /// <summary>
        /// 口令
        /// </summary>
        public string Password { get; set; }
    }
}