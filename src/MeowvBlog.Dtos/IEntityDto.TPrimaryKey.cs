namespace MeowvBlog.Dtos
{
    public interface IEntityDto<TPrimaryKey> : IDto
    {
        TPrimaryKey Id { get; set; }
    }
}