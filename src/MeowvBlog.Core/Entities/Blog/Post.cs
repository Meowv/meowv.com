using System;

namespace MeowvBlog.Core.Entities.Blog
{
    public class Post
    {
        /// <summary>
        /// Primary key
        /// </summary>
        public int Id { get; set; }

        /// <summary>
        /// Title
        /// </summary>
        public string Title { get; set; }

        /// <summary>
        /// Author
        /// </summary>
        public string Author { get; set; }

        /// <summary>
        /// Source
        /// </summary>
        public string Source { get; set; }

        /// <summary>
        /// Url
        /// </summary>
        public string Url { get; set; }

        /// <summary>
        /// Abstract
        /// </summary>
        public string Abstract { get; set; }

        /// <summary>
        /// Content
        /// </summary>
        public string Content { get; set; }

        /// <summary>
        /// Hits
        /// </summary>
        public int Hits { get; set; }

        /// <summary>
        /// CreationTime
        /// </summary>
        public DateTime? CreationTime { get; set; }
    }
}