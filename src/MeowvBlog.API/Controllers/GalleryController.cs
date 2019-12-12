using MeowvBlog.API.Configurations;
using MeowvBlog.API.Extensions;
using MeowvBlog.API.Infrastructure;
using MeowvBlog.API.Models.Dto.Gallery;
using MeowvBlog.API.Models.Dto.Response;
using MeowvBlog.API.Models.Entity.Gallery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

namespace MeowvBlog.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("[controller]")]
    [Produces("application/json")]
    [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v3)]
    public class GalleryController : ControllerBase
    {
        private readonly MeowvBlogDBContext _context;

        public GalleryController(MeowvBlogDBContext context)
        {
            _context = context;
        }

        /// <summary>
        /// 查询图集列表
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [AllowAnonymous]
        public async Task<Response<IList<AlbumForQueryDto>>> QueryAlbumsAsync()
        {
            var response = new Response<IList<AlbumForQueryDto>>();

            var result = await _context.Albums.SelectToListAsync(x => new AlbumForQueryDto()
            {
                Id = x.Id,
                Name = x.Name,
                ImgUrl = x.ImgUrl,
                IsPublic = x.IsPublic
            });

            var imgs = await _context.Images.ToListAsync();
            result.ForEach(x => x.Count = imgs.Count(i => i.AlbumId == x.Id));

            response.Result = result.Randomize().ToList();
            return response;
        }

        /// <summary>
        /// 上传图集封面
        /// </summary>
        /// <param name="file"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("album/upload")]
        [Consumes("multipart/form-data")]
        [ApiExplorerSettings(IgnoreApi = true)]
        public async Task<Response<string>> UploadAlbumAsync(IFormFile file)
        {
            var response = new Response<string>();

            if (file.Length > 0)
            {
                var filaName = Path.GetRandomFileName() + Path.GetExtension(file.FileName);
                var filePath = Path.Combine(AppSettings.Gallery.AlbumPath, filaName);

                using var stream = System.IO.File.Create(filePath);
                await file.CopyToAsync(stream);

                response.Result = filaName;
            }

            return response;
        }

        /// <summary>
        /// 新增图集
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("album/insert")]
        public async Task<Response<string>> InsertAlbumAsync([FromBody] AlbumDto dto)
        {
            var response = new Response<string>();

            var album = new Album
            {
                Id = Guid.NewGuid().GenerateNumber(),
                Name = dto.Name,
                ImgUrl = dto.ImgUrl,
                Date = DateTime.Now,
                IsPublic = dto.IsPublic,
                Password = dto.Password
            };
            await _context.Albums.AddAsync(album);
            await _context.SaveChangesAsync();

            response.Result = "新增成功";
            return response;
        }

        /// <summary>
        /// 根据Id查询图片列表
        /// </summary>
        /// <param name="id"></param>
        /// <param name="password"></param>
        /// <returns></returns>
        [HttpGet]
        [AllowAnonymous]
        [Route("images")]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "id", "password" })]
        public async Task<Response<IList<ImageForQueryDto>>> QueryImagesAsync(string id, string password)
        {
            var response = new Response<IList<ImageForQueryDto>>();

            var albums = await _context.Albums.FirstOrDefaultAsync(x => x.Id == id);
            if (albums.Password != password)
            {
                response.Msg = "口令错误";
                return response;
            }

            var result = await _context.Images.Where(x => x.AlbumId == albums.Id)
                                              .OrderByDescending(x => x.Date)
                                              .SelectToListAsync(x => new ImageForQueryDto
                                              {
                                                  ImgUrl = x.ImgUrl,
                                                  Width = x.Width,
                                                  Height = x.Height
                                              });
            response.Result = result;
            return response;
        }

        /// <summary>
        /// 上传图片
        /// </summary>
        /// <param name="files"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("images/upload")]
        [Consumes("multipart/form-data")]
        [ApiExplorerSettings(IgnoreApi = true)]
        public async Task<Response<IList<string>>> UpdateImagesAsync([FromForm] List<IFormFile> files)
        {
            var response = new Response<IList<string>>();

            var list = new List<string>();
            foreach (var formFile in files)
            {
                if (formFile.Length > 0)
                {
                    var filaName = Path.GetRandomFileName() + Path.GetExtension(formFile.FileName);
                    var filePath = Path.Combine(AppSettings.Gallery.ImagesPath, filaName);

                    using var stream = System.IO.File.Create(filePath);
                    await formFile.CopyToAsync(stream);

                    list.Add(filaName);
                }
            }

            response.Result = list;
            return response;
        }

        /// <summary>
        /// 新增图片
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("images/insert")]
        public async Task<Response<string>> InsertImageV2Async([FromBody] ImageDto dto)
        {
            var response = new Response<string>();

            var images = dto.Imgs.Select(x => new Image
            {
                Id = Guid.NewGuid().GenerateNumber(),
                AlbumId = dto.AlbumId,
                ImgUrl = x.Url,
                Width = x.Width,
                Height = x.Height,
                Date = DateTime.Now
            });

            await _context.Images.AddRangeAsync(images);
            await _context.SaveChangesAsync();

            response.Result = "新增成功";
            return response;
        }

        /// <summary>
        /// 新增图片
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("v2/images/insert")]
        [ApiExplorerSettings(IgnoreApi = true)]
        public async Task<Response<string>> InsertImagesAsync([FromBody] ImageV2Dto dto)
        {
            var response = new Response<string>();

            var images = dto.ImgUrls.SelectToList(x => new Image
            {
                Id = Guid.NewGuid().GenerateNumber(),
                AlbumId = dto.AlbumId,
                ImgUrl = x,
                Width = SixLabors.ImageSharp.Image.Load(Path.Combine(AppSettings.Gallery.ImagesPath, x)).Width,
                Height = SixLabors.ImageSharp.Image.Load(Path.Combine(AppSettings.Gallery.ImagesPath, x)).Height,
                Date = DateTime.Now
            });

            await _context.Images.AddRangeAsync(images);
            await _context.SaveChangesAsync();

            response.Result = "新增成功";
            return response;
        }
    }
}