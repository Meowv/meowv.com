namespace Meowv.Blog.ToolKits.Base
{
    /// <summary>
    /// 服务层响应实体(泛型)
    /// </summary>
    /// <typeparam name="T"></typeparam>
    public class ServiceResult<T> : ServiceResult where T : class, new()
    {
        /// <summary>
        /// 数据
        /// </summary>
        public new T Data { get; set; }
    }
}