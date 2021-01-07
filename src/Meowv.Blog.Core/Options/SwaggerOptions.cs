namespace Meowv.Blog.Options
{
    public class SwaggerOptions
    {
        /// <summary>
        /// 版本
        /// </summary>
        public string Version { get; set; }

        /// <summary>
        /// 标题
        /// </summary>
        public string Title { get; set; }

        /// <summary>
        /// 描述
        /// </summary>
        public string Description { get; set; }

        /// <summary>
        /// 路由前缀
        /// </summary>
        public string RoutePrefix { get; set; }

        /// <summary>
        /// 文档标题
        /// </summary>
        public string DocumentTitle { get; set; }
    }
}