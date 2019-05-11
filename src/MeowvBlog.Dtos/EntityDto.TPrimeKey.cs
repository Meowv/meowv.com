using System;

namespace MeowvBlog.Dtos
{
    [Serializable]
    public class EntityDto<TPrimaryKey> : IEntityDto<TPrimaryKey>, IDto
    {
        public EntityDto()
        {
        }

        public TPrimaryKey Id { get; set; }

        public EntityDto(TPrimaryKey id)
        {
            Id = id;
        }
    }
}