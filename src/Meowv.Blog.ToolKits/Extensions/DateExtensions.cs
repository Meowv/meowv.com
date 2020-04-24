using System;
using System.Globalization;

namespace Meowv.Blog.ToolKits.Extensions
{
    public static class DateExtensions
    {
        /// <summary>
        /// 时间格式转换
        /// </summary>
        /// <param name="date"></param>
        /// <param name="format"></param>
        /// <param name="cultureInfo"></param>
        /// <returns></returns>
        public static string ToDateTime(this DateTime date, string format = "MMMM dd, yyyy HH:mm:ss", string cultureInfo = "en-us")
        {
            return date.ToString(format, new CultureInfo(cultureInfo));
        }
    }
}