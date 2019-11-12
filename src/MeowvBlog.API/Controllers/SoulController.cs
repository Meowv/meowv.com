using MeowvBlog.Core;
using MeowvBlog.Core.Domain.Soul;
using MeowvBlog.Core.Dto;
using MeowvBlog.Core.Dto.Soul;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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
        /// <param name="type"></param>
        /// <returns></returns>
        [HttpGet]
        public async Task<Response<string>> GetRandomChickenSoupAsync(ChickenSoupType type = ChickenSoupType.毒鸡汤)
        {
            var response = new Response<string>();

            var chickenSoups = await _context.ChickenSoups
                                             .FromSqlRaw($"SELECT * FROM ChickenSoups WHERE Type = {(int)type} ORDER BY RANDOM() LIMIT 1")
                                             .FirstOrDefaultAsync();

            response.Result = chickenSoups?.Content;
            return response;
        }

        /// <summary>
        /// 加鸡汤
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [HttpPost]
        [Authorize]
        public async Task<Response<string>> InsertChickenSoupAsync([FromBody] InsertChickenSoupInput input)
        {
            var response = new Response<string>();

            if (!input.List.Any())
            {
                response.Msg = "鸡汤呢？";
                return response;
            }

            var entities = input.List.Select(x => new ChickenSoup
            {
                Content = x,
                Type = input.Type
            });

            await _context.ChickenSoups.AddRangeAsync(entities);
            await _context.SaveChangesAsync();

            response.Result = $"新增成功，{entities.Count()}";
            return response;
        }
    }
}