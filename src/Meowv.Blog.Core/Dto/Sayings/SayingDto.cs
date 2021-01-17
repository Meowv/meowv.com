using Volo.Abp.Domain.Entities;

namespace Meowv.Blog.Dto.Sayings
{
    public class SayingDto : Entity<string>
    {
        public string Content { get; set; }
    }
}