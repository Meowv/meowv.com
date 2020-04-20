using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.Application.Caching
{
    public class CachingServiceBase : ITransientDependency
    {
        protected readonly RedisRepository _redisRepository;

        public CachingServiceBase(RedisRepository redisRepository)
        {
            _redisRepository = redisRepository;
        }
    }
}