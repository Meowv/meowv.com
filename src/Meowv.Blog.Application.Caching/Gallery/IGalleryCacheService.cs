using Meowv.Blog.Application.Contracts.Gallery;
using Meowv.Blog.Application.Contracts.Gallery.Params;
using Meowv.Blog.ToolKits.Base;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Caching.Gallery
{
    public interface IGalleryCacheService
    {
        /// <summary>
        /// 查询图集列表
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<AlbumDto>>> QueryAlbumsAsync(Func<Task<ServiceResult<IEnumerable<AlbumDto>>>> factory);

        /// <summary>
        /// 根据图集参数查询图片列表
        /// </summary>
        /// <param name="input"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<ImageDto>>> QueryImagesAsync(QueryImagesInput input, Func<Task<ServiceResult<IEnumerable<ImageDto>>>> factory);
    }
}