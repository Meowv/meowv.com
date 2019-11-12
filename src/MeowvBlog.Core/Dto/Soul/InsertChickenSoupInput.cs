using System.Collections.Generic;

namespace MeowvBlog.Core.Dto.Soul
{
    public class InsertChickenSoupInput
    {
        /// <summary>
        /// 鸡汤类型
        /// </summary>
        public ChickenSoupType Type { get; set; }

        /// <summary>
        /// 鸡汤数据
        /// </summary>
        public IList<string> List { get; set; }
    }
}