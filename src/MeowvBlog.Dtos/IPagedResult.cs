namespace MeowvBlog.Dtos
{
    public interface IPagedResult<T> : IListResult<T>, IHasTotalCount
    {
    }
}