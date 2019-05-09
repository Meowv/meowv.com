using System;

namespace MeowvBlog.Entities
{
    [Serializable]
    public abstract class Entity<TPrimaryKey> : IEntity<TPrimaryKey>
    {
        public virtual TPrimaryKey Id { get; set; }
    }

    [Serializable]
    public abstract class Entity : Entity<int>, IEntity, IEntity<int>
    {

    }
}