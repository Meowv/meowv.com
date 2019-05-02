namespace MeowvBlog.Services
{
    public static class Extensions
    {
        /// <summary>
        /// 根据标签个数和标签总数计算出style样式
        /// </summary>
        /// <param name="count"></param>
        /// <param name="total"></param>
        /// <returns></returns>
        public static string GetStyleByCount(this int count, int total)
        {
            var style = "weight";

            var percent = (count * 1.0 / total) * 100;

            if (percent >= 99)
            {
                style += "1";
            }
            else if (percent >= 70)
            {
                style += "2";
            }
            else if (percent >= 40)
            {
                style += "3";
            }
            else if (percent >= 20)
            {
                style += "4";
            }
            else if (percent >= 3)
            {
                style += "5";
            }
            else
            {
                style += "6";
            }

            return style;
        }
    }
}