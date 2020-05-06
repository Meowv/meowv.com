using Meowv.Blog.Application.Soul;
using Meowv.Blog.ToolKits.Base;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.AspNetCore.Mvc;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.HttpApi.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [ApiExplorerSettings(GroupName = Grouping.GroupName_v3)]
    public class SoulController : AbpController
    {
        private readonly ISoulService _soulService;

        public SoulController(ISoulService soulService)
        {
            _soulService = soulService;
        }

        /// <summary>
        /// 获取鸡汤文本
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        public async Task<ServiceResult<string>> GetRandomChickenSoupAsync()
        {
            return await _soulService.GetRandomChickenSoupAsync();
        }

        /// <summary>
        /// 批量插入鸡汤
        /// </summary>
        /// <param name="list"></param>
        /// <returns></returns>
        [HttpPost]
        [Authorize]
        public async Task<ServiceResult<string>> BulkInsertChickenSoupAsync(IEnumerable<string> list)
        {
            return await _soulService.BulkInsertChickenSoupAsync(list);
        }
    }
}