using System;
using System.Collections.Concurrent;
using System.Reflection;

namespace Meowv.Blog.ToolKits.Extensions
{
    public static class ReflectionExtension
    {
        private static readonly ConcurrentDictionary<Type, PropertyInfo[]> PropertiesDic =
   new ConcurrentDictionary<Type, PropertyInfo[]>();

        /// <summary>
        /// 获取实体字段
        /// </summary>
        /// <param name="type"></param>
        /// <returns></returns>
        public static PropertyInfo[] GetEntityProperties(this Type type)
        {
            return PropertiesDic.GetOrAdd(type, item => type.GetProperties(BindingFlags.Instance | BindingFlags.Public));
        }
    }
}