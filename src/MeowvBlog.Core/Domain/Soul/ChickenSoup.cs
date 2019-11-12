namespace MeowvBlog.Core.Domain.Soul
{
    public class ChickenSoup
    {
        /// <summary>
        /// 主键
        /// </summary>
        public int Id { get; set; }

        /// <summary>
        /// 内容
        /// </summary>
        public string Content { get; set; }

        /// <summary>
        /// 鸡汤类型 <see cref="ChickenSoupType"/>
        /// </summary>
        public ChickenSoupType Type { get; set; }
    }
}