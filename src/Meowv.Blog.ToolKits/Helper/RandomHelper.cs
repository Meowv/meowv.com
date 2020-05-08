using System;

namespace Meowv.Blog.ToolKits.Helper
{
    public static class RandomHelper
    {
        /// <summary>
        /// 随机数
        /// </summary>
        /// <param name="maxValue"></param>
        /// <returns></returns>
        public static decimal RandomNext(int maxValue)
        {
            var rand = new Random(Guid.NewGuid().GetHashCode());
            return rand.Next(maxValue);
        }
    }
}