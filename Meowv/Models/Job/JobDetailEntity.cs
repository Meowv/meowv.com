namespace Meowv.Models.Job
{
    /// <summary>
    /// 招聘信息详情
    /// </summary>
    public class JobDetailEntity
    {
        /// <summary>
        /// 学历要求
        /// </summary>
        public string Education { get; set; }

        /// <summary>
        /// 工作经验
        /// </summary>
        public string Experience { get; set; }

        /// <summary>
        /// 公司性质
        /// </summary>
        public string CompanyNature { get; set; }

        /// <summary>
        /// 公司规模
        /// </summary>
        public string CompanySize { get; set; }

        /// <summary>
        /// 职位描述/工作要求
        /// </summary>
        public string Requirement { get; set; }

        /// <summary>
        /// 公司介绍
        /// </summary>
        public string CompanyIntroducation { get; set; }
    }
}