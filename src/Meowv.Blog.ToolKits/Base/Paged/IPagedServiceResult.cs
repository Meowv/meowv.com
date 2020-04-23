namespace Meowv.Blog.ToolKits.Base.Paged
{
    public interface IPagedServiceResult<T> : IListResult<T>, IHasTotalCount
    {
    }
}