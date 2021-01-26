namespace Meowv.Blog.Response
{
    public interface IPagedList<T> : IListResult<T>, IHasTotalCount
    {
    }
}