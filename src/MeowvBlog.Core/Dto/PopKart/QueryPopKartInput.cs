namespace MeowvBlog.Core.Dto.PopKart
{
    public class QueryPopKartInput
    {
        /// <summary>
        /// 赛车名字
        /// </summary>
        public string Name { get; set; }

        /// <summary>
        /// 赛车类型
        /// </summary>
        public int Type { get; set; }

        /// <summary>
        /// 赛车稀有度
        /// </summary>
        public int Rarity { get; set; }
    }
}