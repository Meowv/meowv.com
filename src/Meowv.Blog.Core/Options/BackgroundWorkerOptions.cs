namespace Meowv.Blog.Options
{
    public class BackgroundWorkerOptions
    {
        /// <summary>
        /// Gets or sets whether background worker is enabled
        /// </summary>
        public bool IsEnabled { get; set; }

        /// <summary>
        /// The cron expression to base the schedule on
        /// </summary>
        public string HotNewsCron { get; set; }

        /// <summary>
        /// The cron expression to base the schedule on
        /// </summary>
        public string WallpaperCron { get; set; }
    }
}