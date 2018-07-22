namespace Meowv.Models.Job
{
    /// <summary>
    /// 招聘信息内容
    /// </summary>
    public class JobEntity
    {
        /// <summary>
        /// 职位名称
        /// </summary>
        public string PositionName { get; set; }

        /// <summary>
        /// 公司名称
        /// </summary>
        public string CompanyName { get; set; }

        /// <summary>
        /// 薪水
        /// </summary>
        public string Salary { get; set; }

        /// <summary>
        /// 工作地点
        /// </summary>
        public string WorkingPlace { get; set; }

        /// <summary>
        /// 发布日期
        /// </summary>
        public string ReleaseDate { get; set; }

        /// <summary>
        /// 详情地址
        /// </summary>
        public string DetailUrl { get; set; }

        /// <summary>
        /// 来源
        /// </summary>
        public string Source { get; set; }
    }
}
