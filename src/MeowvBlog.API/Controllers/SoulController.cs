using MeowvBlog.API.Configurations;
using MeowvBlog.API.Infrastructure;
using MeowvBlog.API.Models.Dto.Response;
using MeowvBlog.API.Models.Entity.ChickenSoup;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace MeowvBlog.API.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Produces("application/json")]
    [ApiExplorerSettings(GroupName = GlobalConsts.GroupName_v3)]
    public class SoulController : ControllerBase
    {
        private readonly MeowvBlogDBContext _context;

        public SoulController(MeowvBlogDBContext context)
        {
            _context = context;
        }

        /// <summary>
        /// 获取鸡汤文本
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        public async Task<Response<string>> GetRandomChickenSoupAsync()
        {
            var response = new Response<string>();

            var chickenSoups = await _context.ChickenSoups
                                             .FromSqlRaw($"SELECT * FROM ChickenSoups ORDER BY RANDOM() LIMIT 1")
                                             .FirstOrDefaultAsync();

            response.Result = chickenSoups?.Content;
            return response;
        }

        /// <summary>
        /// 加鸡汤
        /// </summary>
        /// <param name="list"></param>
        /// <returns></returns>
        [HttpPost]
        [Authorize]
        public async Task<Response<string>> InsertChickenSoupAsync([FromBody] IList<string> list)
        {
            var response = new Response<string>();

            if (!list.Any())
            {
                response.Msg = "鸡汤呢？";
                return response;
            }

            var entities = list.Select(x => new ChickenSoup { Content = x });

            await _context.ChickenSoups.AddRangeAsync(entities);
            await _context.SaveChangesAsync();

            response.Result = $"新增成功，{entities.Count()}";
            return response;
        }
    }
}