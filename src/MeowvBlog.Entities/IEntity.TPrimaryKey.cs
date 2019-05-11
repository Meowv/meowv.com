namespace MeowvBlog.Entities
{
    public interface IEntity<TPrimaryKey>
    {
        TPrimaryKey Id { get; set; }

        bool IsTransient();
    }
}