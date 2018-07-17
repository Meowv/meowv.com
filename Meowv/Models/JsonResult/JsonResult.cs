namespace Meowv.Models.JsonResult
{
    public class JsonResult<T>
    {
        /// <summary>
        /// 成功/失败
        /// </summary>
        public string Reason { get; set; } = "success";

        /// <summary>
        /// 返回结果
        /// </summary>
        public T Result { get; set; }
    }
}