using Meowv.Blog.Application.Caching.Gallery;
using Meowv.Blog.Application.Contracts.Gallery;
using Meowv.Blog.Application.Contracts.Gallery.Params;
using Meowv.Blog.Domain.Gallery;
using Meowv.Blog.Domain.Gallery.Repositories;
using Meowv.Blog.ToolKits.Base;
using Meowv.Blog.ToolKits.Extensions;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.Application.Gallery.Impl
{
    public class GalleryService : ServiceBase, IGalleryService
    {
        private readonly IAlbumRepository _albumRepository;
        private readonly IImageRepository _imageRepository;
        private readonly IGalleryCacheService _galleryCacheService;

        public GalleryService(IAlbumRepository albumRepository,
                              IImageRepository imageRepository,
                              IGalleryCacheService galleryCacheService)
        {
            _albumRepository = albumRepository;
            _imageRepository = imageRepository;
            _galleryCacheService = galleryCacheService;
        }

        /// <summary>
        /// 查询图集列表
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<AlbumDto>>> QueryAlbumsAsync()
        {
            return await _galleryCacheService.QueryAlbumsAsync(async () =>
            {
                var result = new ServiceResult<IEnumerable<AlbumDto>>();

                var images = await _imageRepository.GetListAsync();
                var albums = await _albumRepository.GetListAsync();

                var list = ObjectMapper.Map<IEnumerable<Album>, IEnumerable<AlbumDto>>(albums);
                foreach (var item in list)
                {
                    item.Count = images.Count(x => x.AlbumId == item.Id);
                }

                result.IsSuccess(list);
                return result;
            });
        }

        /// <summary>
        /// 根据图集参数查询图片列表
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<ImageDto>>> QueryImagesAsync(QueryImagesInput input)
        {
            return await _galleryCacheService.QueryImagesAsync(input, async () =>
            {
                var result = new ServiceResult<IEnumerable<ImageDto>>();

                var albums = await _albumRepository.FindAsync(input.Id);

                if (albums.IsNull())
                {
                    result.IsFailed(ResponseText.WHAT_NOT_EXIST.FormatWith("Id", input.Id));
                    return result;
                }

                if (albums.Password != (input.Password ?? ""))
                {
                    result.IsFailed(ResponseText.PASSWORD_WRONG);
                    return result;
                }

                var images = _imageRepository.Where(x => x.AlbumId == albums.Id)
                                             .OrderByDescending(x => x.CreateTime)
                                             .ToList();

                var list = ObjectMapper.Map<IEnumerable<Image>, IEnumerable<ImageDto>>(images);

                result.IsSuccess(list);
                return result;
            });
        }
    }
}