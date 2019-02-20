namespace Meowv.ViewModel.Response
{
    public class ResponseViewModel<T>
    {
        public int Code { get; set; } = 0;

        public string Msg { get; set; } = "successful";

        public T Data { get; set; }
    }
}