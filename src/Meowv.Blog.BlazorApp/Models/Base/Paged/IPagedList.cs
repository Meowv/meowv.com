namespace Meowv.Blog.BlazorApp.Models.Base.Paged
{
    public interface IPagedList<T> : IListResult<T>, IHasTotalCount
    {
    }
}