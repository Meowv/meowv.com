using Meowv.Blog.Domain.Soul;
using Meowv.Blog.Domain.Soul.Repositories;
using Meowv.Blog.ToolKits.Base;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.Application.Soul.Impl
{
    public class SoulService : ServiceBase, ISoulService
    {
        private readonly IChickenSoupRepository _chickenSoupRepository;

        public SoulService(IChickenSoupRepository chickenSoupRepository)
        {
            _chickenSoupRepository = chickenSoupRepository;
        }

        /// <summary>
        /// 获取鸡汤文本
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<string>> GetRandomChickenSoupAsync()
        {
            var result = new ServiceResult<string>();

            var chickenSoup = await _chickenSoupRepository.GetRandomAsync();

            result.IsSuccess(chickenSoup.Content);
            return result;
        }

        /// <summary>
        /// 批量插入鸡汤
        /// </summary>
        /// <param name="list"></param>
        /// <returns></returns>
        public async Task<ServiceResult<string>> BulkInsertChickenSoupAsync(IEnumerable<string> list)
        {
            var result = new ServiceResult<string>();

            if (!list.Any())
            {
                result.IsFailed(ResponseText.DATA_IS_NONE);
                return result;
            }

            var chickenSoups = list.Select(x => new ChickenSoup { Content = x });
            await _chickenSoupRepository.BulkInsertAsync(chickenSoups);

            result.IsSuccess(ResponseText.INSERT_SUCCESS);
            return result;
        }
    }
}