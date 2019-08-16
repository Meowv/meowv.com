using Plus.Domain.Entities;
using System;

namespace MeowvBlog.Core.Domain.Commits
{
    public class Commit : Entity<string>
    {
        public string Sha { get; set; }

        public string Message { get; set; }

        public DateTime Date { get; set; }
    }
}