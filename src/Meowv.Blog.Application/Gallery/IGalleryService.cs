using Meowv.Blog.Application.Contracts.Gallery;
using Meowv.Blog.Application.Contracts.Gallery.Params;
using Meowv.Blog.ToolKits.Base;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Gallery
{
    public interface IGalleryService
    {
        /// <summary>
        /// 查询图集列表
        /// </summary>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<AlbumDto>>> QueryAlbumsAsync();

        /// <summary>
        /// 根据图集参数查询图片列表
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<ImageDto>>> QueryImagesAsync(QueryImagesInput input);
    }
}