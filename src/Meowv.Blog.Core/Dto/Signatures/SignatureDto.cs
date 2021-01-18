using Volo.Abp.Domain.Entities;

namespace Meowv.Blog.Dto.Signatures
{
    public class SignatureDto : Entity<string>
    {
        public string Name { get; set; }

        public string Type { get; set; }

        public string Url { get; set; }

        public string Ip { get; set; }

        public string CreatedAt { get; set; }
    }
}