using System.ComponentModel;

namespace Meowv.Processor.Job
{
    /// <summary>
    /// 招聘渠道
    /// </summary>
    public enum JobRecruitment
    {
        /// <summary>
        /// 智联招聘
        /// </summary>
        [Description("智联招聘")]
        _zhaopin = 0,

        /// <summary>
        /// 前程无忧
        /// </summary>
        [Description("前程无忧")]
        _51job = 1,

        /// <summary>
        /// 猎聘网
        /// </summary>
        [Description("猎聘网")]
        _liepin = 2,

        /// <summary>
        /// Boss直聘
        /// </summary>
        [Description("Boss直聘")]
        _zhipin = 3,

        /// <summary>
        /// 拉勾网
        /// </summary>
        [Description("拉勾网")]
        _lagou = 4
    }
}