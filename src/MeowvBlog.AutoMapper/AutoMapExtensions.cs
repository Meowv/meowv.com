using AutoMapper;

public static class AutoMapExtensions
{
    public static TDestination MapTo<TDestination>(this object source)
    {
        return Mapper.Map<TDestination>(source);
    }

    public static TDestination MapTo<TSource, TDestination>(this TSource source, TDestination destination)
    {
        return Mapper.Map(source, destination);
    }
}