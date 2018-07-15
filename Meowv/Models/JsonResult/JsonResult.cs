namespace Meowv.Models.JsonResult
{
    public class JsonResult<T>
    {
        public string Reason { get; set; } = "success";
        public T Result { get; set; }
    }
}