using Volo.Abp.Domain.Entities;

namespace Meowv.Blog.Dto.Hots
{
    public class HotSourceDto : Entity<string>
    {
        public string Source { get; set; }
    }
}