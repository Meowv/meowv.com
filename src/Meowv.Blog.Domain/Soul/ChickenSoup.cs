using Volo.Abp.Domain.Entities;

namespace Meowv.Blog.Domain.Soul
{
    public class ChickenSoup : Entity<int>
    {
        /// <summary>
        /// 内容
        /// </summary>
        public string Content { get; set; }
    }
}