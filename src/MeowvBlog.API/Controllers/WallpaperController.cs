using MeowvBlog.API.Configurations;
using MeowvBlog.API.Extensions;
using MeowvBlog.API.Infrastructure;
using MeowvBlog.API.Models.Dto.Response;
using MeowvBlog.API.Models.Dto.Wallpaper;
using MeowvBlog.API.Models.Entity.Wallpaper;
using MeowvBlog.API.Models.Enum;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace MeowvBlog.API.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Produces("application/json")]
    [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v3)]
    public class WallpaperController : ControllerBase
    {
        private readonly MeowvBlogDBContext _context;

        public WallpaperController(MeowvBlogDBContext context)
        {
            _context = context;
        }

        /// <summary>
        /// 获取壁纸分类
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        [Route("types")]
        [ResponseCache(CacheProfileName = "default")]
        public async Task<Response<IList<EnumResponse>>> GetWallpaperTypeAsync()
        {
            var response = new Response<IList<EnumResponse>>();

            var result = typeof(WallpaperType).EnumToList();
            response.Result = result;

            return await Task.FromResult(response);
        }

        /// <summary>
        /// 分页查询壁纸
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpGet]
        [ResponseCache(CacheProfileName = "default", VaryByQueryKeys = new string[] { "type", "page", "limit" })]
        public async Task<Response<IList<WallpaperDto>>> QueryWallpaperAsync([FromQuery] QueryWallpaperInput input)
        {
            var response = new Response<IList<WallpaperDto>>();

            var wallpapers = _context.Wallpapers.Where(x => x.Type == (int)input.Type);
            var count = await wallpapers.CountAsync();

            var result = await wallpapers.OrderByDescending(x => x.Timestamp)
                                         .Skip((input.Page - 1) * input.Limit)
                                         .Take(input.Limit)
                                         .SelectToListAsync(x => new WallpaperDto
                                         {
                                             Title = x.Title,
                                             Url = x.Url
                                         });
            response.Result = result;
            return response;
        }

        /// <summary>
        /// 批量插入壁纸
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPost]
        public async Task<Response<string>> BulkInsertWallpaperAsync([FromBody] InsertWallpaperInput input)
        {
            var response = new Response<string>();

            string spider = HttpContext.Request.Headers["spider"];
            if (spider != "python")
            {
                response.Msg = "缺少HEADERS值";
                return response;
            }

            var wallpapers = input.Wallpapers.SelectToList(x => new Wallpaper
            {
                Id = Guid.NewGuid().GenerateNumber(),
                Title = x.Title,
                Url = x.Url,
                Type = (int)input.Type,
                Timestamp = x.Url.Split("/").Last().Split("_").First()
            });

            var urls = await _context.Wallpapers
                                     .Where(x => x.Type == wallpapers.FirstOrDefault().Type)
                                     .SelectToListAsync(x => x.Url);

            wallpapers = wallpapers.Where(x => !urls.Contains(x.Url)).ToList();

            await _context.Wallpapers.AddRangeAsync(wallpapers);
            await _context.SaveChangesAsync();

            response.Result = "新增成功";
            return response;
        }
    }
}