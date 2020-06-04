using Meowv.Blog.ToolKits.Extensions;
using Microsoft.Extensions.Caching.Distributed;
using System.Linq;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.Application.Caching
{
    public class CachingServiceBase : ITransientDependency
    {
        public IDistributedCache Cache { get; set; }

        public async Task RemoveAsync(string key, int cursor = 0)
        {
            var scan = await RedisHelper.ScanAsync(cursor);
            var keys = scan.Items;

            if (keys.Any() && key.IsNotNullOrEmpty())
            {
                keys = keys.Where(x => x.StartsWith(key)).ToArray();

                await RedisHelper.DelAsync(keys);
            }
        }
    }

    public interface ICacheRemoveService
    {
        /// <summary>
        /// 移除缓存
        /// </summary>
        /// <param name="key"></param>
        /// <param name="cursor"></param>
        /// <returns></returns>
        Task RemoveAsync(string key, int cursor = 0);
    }
}