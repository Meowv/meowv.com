using AutoMapper;
using System;
using System.Reflection;

namespace MeowvBlog.AutoMapper
{
    public static class AutoMapperConfigurationExtensions
    {
        private static readonly object SyncObj = new object();

        public static void CreateAutoAttributeMaps(this IMapperConfigurationExpression configuration, Type type)
        {
            lock (SyncObj)
            {
                foreach (var autoMapAttribute in type.GetTypeInfo().GetCustomAttributes<AutoMapAttributeBase>())
                {
                    autoMapAttribute.CreateMap(configuration, type);
                }
            }
        }
    }
}