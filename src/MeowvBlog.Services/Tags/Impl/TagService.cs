using MeowvBlog.Core.Domain.Tags.Repositories;

namespace MeowvBlog.Services.Tags.Impl
{
    /// <summary>
    /// 标签服务接口实现
    /// </summary>
    public class TagService : ITagService
    {
        private readonly ITagRepository _tagRepository;

        public TagService(ITagRepository tagRepository)
        {
            _tagRepository = tagRepository;
        }
    }
}