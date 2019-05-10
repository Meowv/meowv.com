using System;
using System.Reflection;

namespace MeowvBlog.CodeAnnotations
{
    public static class EnumExtensions
    {
        /// <summary>
        /// ToAlias-获取枚举对应别名描述
        /// </summary>
        /// <param name="enum"></param>
        /// <returns></returns>
        public static string ToAlias(this Enum @enum)
        {
            Type type = @enum.GetType();
            FieldInfo field = type.GetField(@enum.ToString());
            if (field == null)
            {
                return string.Empty;
            }
            object[] customAttributes = field.GetCustomAttributes(typeof(EnumAliasAttribute), inherit: false);
            string result = string.Empty;
            object[] array = customAttributes;
            for (int i = 0; i < array.Length; i++)
            {
                EnumAliasAttribute enumAliasAttribute = (EnumAliasAttribute)array[i];
                result = enumAliasAttribute.Alias;
            }
            return result;
        }
    }
}