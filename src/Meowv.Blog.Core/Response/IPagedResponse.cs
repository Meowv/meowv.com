namespace Meowv.Blog.Response
{
    public interface IPagedResponse<T> : IListResult<T>, IHasTotalCount
    {
    }
}