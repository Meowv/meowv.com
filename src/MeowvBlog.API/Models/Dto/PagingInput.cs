namespace MeowvBlog.API.Models.Dto
{
    public class PagingInput
    {
        public int Page { get; set; } = 1;

        public int Limit { get; set; } = 20;
    }
}