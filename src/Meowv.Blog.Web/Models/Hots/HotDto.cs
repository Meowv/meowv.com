using System.Collections.Generic;

namespace Meowv.Blog.Dto.Hots
{
    public class HotDto
    {
        public string Source { get; set; }

        public List<Data> Datas { get; set; }

        public string CreatedAt { get; set; }
    }

    public class Data
    {
        public string Title { get; set; }

        public string Url { get; set; }
    }
}