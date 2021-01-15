using Volo.Abp.Domain.Entities;

namespace Meowv.Blog.Dto.News
{
    public class HotSourceDto : Entity<string>
    {
        public string Source { get; set; }
    }
}