using AutoMapper;
using System;
using System.Reflection;

namespace MeowvBlog.AutoMapper
{
    public static class Extensions
    {
        private static readonly object Sync = new object();

        public static TDestination MapTo<TSource, TDestination>(this TSource source, TDestination destination)
        {
            return MapTo<TDestination>(source, destination);
        }

        public static TDestination MapTo<TDestination>(this object source) where TDestination : new()
        {
            return MapTo(source, new TDestination());
        }

        #region Private

        private static TDestination MapTo<TDestination>(object source, TDestination destination)
        {
            if (source == null)
                throw new ArgumentNullException(nameof(source));
            if (destination == null)
                throw new ArgumentNullException(nameof(destination));
            var sourceType = GetType(source);
            var destinationType = GetType(destination);
            var map = GetMap(sourceType, destinationType);
            if (map != null)
                return Mapper.Map(source, destination);
            lock (Sync)
            {
                map = GetMap(sourceType, destinationType);
                if (map != null)
                    return Mapper.Map(source, destination);
                InitMaps(sourceType, destinationType);
            }
            return Mapper.Map(source, destination);
        }

        /// <summary>
        /// 获取类型
        /// </summary>
        private static Type GetType(object obj)
        {
            var type = obj.GetType();
            if ((obj is System.Collections.IEnumerable) == false)
                return type;
            if (type.IsArray)
                return type.GetElementType();
            var genericArgumentsTypes = type.GetTypeInfo().GetGenericArguments();
            if (genericArgumentsTypes == null || genericArgumentsTypes.Length == 0)
                throw new ArgumentException("泛型类型参数不能为空");
            return genericArgumentsTypes[0];
        }

        /// <summary>
        /// 获取映射配置
        /// </summary>
        private static TypeMap GetMap(Type sourceType, Type destinationType)
        {
            try
            {
                return Mapper.Configuration.FindTypeMapFor(sourceType, destinationType);
            }
            catch (InvalidOperationException)
            {
                lock (Sync)
                {
                    try
                    {
                        return Mapper.Configuration.FindTypeMapFor(sourceType, destinationType);
                    }
                    catch (InvalidOperationException)
                    {
                        InitMaps(sourceType, destinationType);
                    }
                    return Mapper.Configuration.FindTypeMapFor(sourceType, destinationType);
                }
            }
        }

        /// <summary>
        /// 初始化映射配置
        /// </summary>
        private static void InitMaps(Type sourceType, Type destinationType)
        {
            try
            {
                var maps = Mapper.Configuration.GetAllTypeMaps();
                Mapper.Initialize(config => config.CreateMap(sourceType, destinationType));
                foreach (var map in maps)
                    Mapper.Configuration.RegisterTypeMap(map);
            }
            catch (InvalidOperationException)
            {
                Mapper.Initialize(config => config.CreateMap(sourceType, destinationType));
            }
        }

        #endregion
    }
}