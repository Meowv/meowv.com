using System;

namespace MeowvBlog.Entities
{
    [Serializable]
    public abstract class Entity : Entity<int>, IEntity, IEntity<int>
    {
    }
}