using MeowvBlog.API.Configurations;
using MeowvBlog.API.Extensions;
using MeowvBlog.API.Infrastructure;
using MeowvBlog.API.Models.Dto.Response;
using MeowvBlog.API.Models.Dto.Wallpaper;
using MeowvBlog.API.Models.Entity.Wallpaper;
using Microsoft.AspNetCore.Mvc;
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
        /// 批量插入壁纸
        /// </summary>
        /// <param name="list"></param>
        /// <returns></returns>
        [HttpPost]
        public async Task<Response<string>> BulkInsertWallpaperAsync([FromBody] IList<WallpaperDto> list)
        {
            var response = new Response<string>();

            string spider = HttpContext.Request.Headers["spider"];
            if (spider != "python")
            {
                response.Msg = "缺少HEADERS值";
                return response;
            }

            var wallpapers = list.SelectToList(x => new Wallpaper
            {
                Id = Guid.NewGuid().GenerateNumber(),
                Title = x.Title,
                Url = x.Url,
                Type = x.Type,
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