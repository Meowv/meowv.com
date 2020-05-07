using Meowv.Blog.Domain.Gallery.Repositories;

namespace Meowv.Blog.Application.Gallery.Impl
{
    public class GalleryService : ServiceBase, IGalleryService
    {
        private readonly IAlbumRepository _albumRepository;
        private readonly IImageRepository _imageRepository;

        public GalleryService(IAlbumRepository albumRepository, IImageRepository imageRepository)
        {
            _albumRepository = albumRepository;
            _imageRepository = imageRepository;
        }


    }
}