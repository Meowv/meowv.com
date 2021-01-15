using Meowv.Blog.Domain.News;
using System.Collections.Generic;

namespace Meowv.Blog.Dto.News.Params
{
    public class HotDto
    {
        public string Source { get; set; }

        public List<Data> Datas { get; set; }

        public string CreatedAt { get; set; }
    }
}