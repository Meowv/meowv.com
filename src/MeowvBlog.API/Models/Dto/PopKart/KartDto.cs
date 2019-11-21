namespace MeowvBlog.API.Models.Dto.PopKart
{
    public class KartDto
    {
        /// <summary>
        /// 赛车名字
        /// </summary>
        public string Name { get; set; }

        /// <summary>
        /// 赛车类型
        /// </summary>
        public string Type { get; set; }

        /// <summary>
        /// 赛车稀有度
        /// </summary>
        public string Rarity { get; set; }

        /// <summary>
        /// 性能参数 - 漂移,加速度,弯道,加速时间,集气速度
        /// </summary>
        public int[] Properties { get; set; }
    }
}