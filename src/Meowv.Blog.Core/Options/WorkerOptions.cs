namespace Meowv.Blog.Options
{
    public class WorkerOptions
    {
        /// <summary>
        /// Gets or sets whether background worker is enabled
        /// </summary>
        public bool IsEnabled { get; set; }

        /// <summary>
        /// The cron expression to base the schedule on
        /// </summary>
        public string Cron { get; set; }
    }
}