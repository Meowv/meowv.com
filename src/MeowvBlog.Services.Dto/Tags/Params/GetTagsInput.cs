namespace MeowvBlog.Services.Dto.Tags.Params
{
    /// <summary>
    /// 标签页输出参数
    /// </summary>
    public class GetTagsInput
    {
        /// <summary>
        /// 标签
        /// </summary>
        public TagDto Tag { get; set; }

        /// <summary>
        /// 标签个数
        /// </summary>
        public int Count { get; set; }

        /// <summary>
        /// 样式名称
        /// </summary>
        public string Style { get; set; }
    }
}