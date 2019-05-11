using System;

namespace MeowvBlog.Dtos
{
    [Serializable]
    public class EntityDto : EntityDto<int>, IEntityDto, IEntityDto<int>, IDto
    {
        public EntityDto()
        {
        }

        public EntityDto(int id)
            : base(id)
        {
        }
    }
}