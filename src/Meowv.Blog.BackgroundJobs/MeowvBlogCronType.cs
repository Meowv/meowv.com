using Hangfire;
using System;

namespace Meowv.Blog.BackgroundJobs
{
    /// <summary>
    /// Cron类型
    /// </summary>
    public static class CronType
    {
        /// <summary>
        /// 周期性为分钟的任务
        /// </summary>
        /// <param name="interval">执行周期的间隔，默认为每分钟一次</param>
        /// <returns></returns>
        public static string Minute(int interval = 1)
        {
            return "1 0/" + interval.ToString() + " * * * ? ";
        }

        /// <summary>
        /// 周期性为小时的任务
        /// </summary>
        /// <param name="minute">第几分钟开始，默认为第一分钟</param>
        /// <param name="interval">执行周期的间隔，默认为每小时一次</param>
        /// <returns></returns>
        public static string Hour(int minute = 1, int interval = 1)
        {
            return "1 " + minute + " 0/" + interval.ToString() + " * * ? ";
        }

        /// <summary>
        /// 周期性为天的任务
        /// </summary>
        /// <param name="hour">第几小时开始，默认从1点开始</param>
        /// <param name="minute">第几分钟开始，默认从第1分钟开始</param>
        /// <param name="interval">执行周期的间隔，默认为每天一次</param>
        /// <returns></returns>
        public static string Day(int hour = 1, int minute = 1, int interval = 1)
        {
            return "1 " + minute.ToString() + " " + hour.ToString() + " 1/" + interval.ToString() + " * ? ";
        }

        /// <summary>
        /// 周期性为周的任务
        /// </summary>
        /// <param name="dayOfWeek">星期几开始，默认从星期一点开始</param>
        /// <param name="hour">第几小时开始，默认从1点开始</param>
        /// <param name="minute">第几分钟开始，默认从第1分钟开始</param>
        /// <returns></returns>
        public static string Week(DayOfWeek dayOfWeek = DayOfWeek.Monday, int hour = 1, int minute = 1)
        {
            return Cron.Weekly(dayOfWeek, hour, minute);
        }

        /// <summary>
        /// 周期性为月的任务
        /// </summary>
        /// <param name="day">几号开始，默认从一号开始</param>
        /// <param name="hour">第几小时开始，默认从1点开始</param>
        /// <param name="minute">第几分钟开始，默认从第1分钟开始</param>
        /// <returns></returns>
        public static string Month(int day = 1, int hour = 1, int minute = 1)
        {
            return Cron.Monthly(day, hour, minute);
        }

        /// <summary>
        /// 周期性为年的任务
        /// </summary>
        /// <param name="month">几月开始，默认从一月开始</param>
        /// <param name="day">几号开始，默认从一号开始</param>
        /// <param name="hour">第几小时开始，默认从1点开始</param>
        /// <param name="minute">第几分钟开始，默认从第1分钟开始</param>
        /// <returns></returns>
        public static string Year(int month = 1, int day = 1, int hour = 1, int minute = 1)
        {
            return Cron.Yearly(month, day, hour, minute);
        }
    }
}