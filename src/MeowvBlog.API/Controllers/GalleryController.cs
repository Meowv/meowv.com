using MeowvBlog.Core;
using MeowvBlog.Core.Configurations;
using MeowvBlog.Core.Domain.Gallery;
using MeowvBlog.Core.Dto;
using MeowvBlog.Core.Dto.Gallery;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Extension = MeowvBlog.API.Extensions.Extensions;

namespace MeowvBlog.API.Controllers
{
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
        [ResponseCache(CacheProfileName = "default")]
        public async Task<Response<IList<AlbumForQueryDto>>> QueryAlbumsAsync()
        {
            var response = new Response<IList<AlbumForQueryDto>>();

            var result = await _context.Albums.Select(x => new AlbumForQueryDto()
            {
                Id = x.Id,
                Name = x.Name,
                ImgUrl = x.ImgUrl
            }).ToListAsync();

            response.Result = result;
            return response;
        }

        /// <summary>
        /// 上传图集
        /// </summary>
        /// <param name="file"></param>
        /// <returns></returns>
        [HttpPost]
        [Route("album/upload")]
        [Consumes("multipart/form-data")]
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
                Id = Extension.GenerateGuid(),
                Name = dto.Name,
                ImgUrl = dto.ImgUrl,
                Date = DateTime.Now
            };
            await _context.Albums.AddAsync(album);
            await _context.SaveChangesAsync();

            response.Result = "新增成功";
            return response;
        }

        /// <summary>
        /// 查询图片列表
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [HttpGet]
        [Route("images")]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "id" })]
        public async Task<Response<IList<string>>> QueryImagesAsync(string id)
        {
            var response = new Response<IList<string>>();

            var result = await _context.Images.Where(x => x.AlbumId == id).OrderByDescending(x => x.Date).Select(x => x.ImgUrl).ToListAsync();

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
        public async Task<Response<string>> InsertImagesAsync([FromBody] ImageDto dto)
        {
            var response = new Response<string>();

            var images = dto.ImgUrls.Select(x => new Image
            {
                Id = Extension.GenerateGuid(),
                AlbumId = dto.AlbumId,
                ImgUrl = x,
                Date = DateTime.Now
            }).ToList();

            await _context.Images.AddRangeAsync(images);
            await _context.SaveChangesAsync();

            response.Result = "新增成功";
            return response;
        }
    }
}