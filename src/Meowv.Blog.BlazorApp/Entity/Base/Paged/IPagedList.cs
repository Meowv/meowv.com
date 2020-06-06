namespace Meowv.Blog.BlazorApp.Entity.Base.Paged
{
    public interface IPagedList<T> : IListResult<T>, IHasTotalCount
    {
    }
}