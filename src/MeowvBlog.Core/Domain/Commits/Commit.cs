using System;

namespace MeowvBlog.Core.Domain.Commits
{
    public class Commit
    {
        public string Sha { get; set; }

        public string Message { get; set; }

        public DateTime Date { get; set; }
    }
}