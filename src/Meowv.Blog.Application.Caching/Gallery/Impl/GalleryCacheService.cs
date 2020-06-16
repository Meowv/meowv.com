using Meowv.Blog.Application.Contracts.Gallery;
using Meowv.Blog.Application.Contracts.Gallery.Params;
using Meowv.Blog.ToolKits.Base;
using Meowv.Blog.ToolKits.Extensions;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.Application.Caching.Gallery.Impl
{
    public class GalleryCacheService : CachingServiceBase, IGalleryCacheService
    {
        private const string KEY_QueryAlbums = "Gallery:QueryAlbums";
        private const string KEY_QueryImages = "Gallery:QueryImages-{0}";

        /// <summary>
        /// 查询图集列表
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<AlbumDto>>> QueryAlbumsAsync(Func<Task<ServiceResult<IEnumerable<AlbumDto>>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_QueryAlbums, factory, CacheStrategy.ONE_DAY);
        }

        /// <summary>
        /// 根据图集参数查询图片列表
        /// </summary>
        /// <param name="input"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<ImageDto>>> QueryImagesAsync(QueryImagesInput input, Func<Task<ServiceResult<IEnumerable<ImageDto>>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_QueryImages.FormatWith((input.Id + input.Password).EncodeMd5String()), factory, CacheStrategy.ONE_DAY);
        }
    }
}