namespace Meowv.Blog.Options
{
    public class StorageOptions
    {
        /// <summary>
        /// Gets or sets mongodb connection string
        /// </summary>
        public string Mongodb { get; set; }

        /// <summary>
        /// Gets or sets whether redis is enabled
        /// </summary>
        public bool RedisIsEnabled { get; set; }

        /// <summary>
        /// Gets or sets redis connection string
        /// </summary>
        public string Redis { get; set; }
    }
}