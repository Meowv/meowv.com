using System;

namespace Meowv.Blog.Application.Caching
{
    public enum RedisItemType
    {
        None = 0,
        String = 1,
        List = 2,
        Set = 3,
        SortedSet = 4,
        Hash = 5,
        Unknown = 6,
    }

    public enum RedisSetOperation
    {
        Union,
        Intersect,
        Difference
    }

    public enum RedisAggregate
    {
        Sum,
        Min,
        Max
    }

    [Flags]
    public enum RedisExclude
    {
        None = 0,
        Start = 1,
        Stop = 2,
        Both = Start | Stop
    }

    public enum RedisOrder
    {
        Ascending,
        Descending
    }
}