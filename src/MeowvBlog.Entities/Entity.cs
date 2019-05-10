using System;
using System.Collections.Generic;

namespace MeowvBlog.Entities
{
    [Serializable]
    public abstract class Entity<TPrimaryKey> : IEntity<TPrimaryKey>
    {
        public virtual TPrimaryKey Id { get; set; }

        public virtual bool IsTransient()
        {
            return EqualityComparer<TPrimaryKey>.Default.Equals(Id, default);
        }

        public override bool Equals(object obj)
        {
            if (obj == null || !(obj is Entity<TPrimaryKey>))
            {
                return false;
            }
            if (this == obj as Entity<TPrimaryKey>)
            {
                return true;
            }
            Entity<TPrimaryKey> entity = (Entity<TPrimaryKey>)obj;
            if (IsTransient() && entity.IsTransient())
            {
                return false;
            }
            Type type = GetType();
            Type type2 = entity.GetType();
            if (!type.IsAssignableFrom(type2) && !type2.IsAssignableFrom(type))
            {
                return false;
            }
            return Id.Equals(entity.Id);
        }

        public override int GetHashCode()
        {
            return Id.GetHashCode();
        }

        public static bool operator ==(Entity<TPrimaryKey> left, Entity<TPrimaryKey> right)
        {
            if (Equals(left, null))
            {
                return Equals(right, null);
            }
            return left.Equals(right);
        }

        public static bool operator !=(Entity<TPrimaryKey> left, Entity<TPrimaryKey> right)
        {
            return !(left == right);
        }

        public override string ToString()
        {
            return $"[{GetType().Name} {Id}]";
        }
    }

    [Serializable]
    public abstract class Entity : Entity<int>, IEntity, IEntity<int>
    {
    }
}