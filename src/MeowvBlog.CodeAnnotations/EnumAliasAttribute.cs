using System;

namespace MeowvBlog.CodeAnnotations
{
    public class EnumAliasAttribute : Attribute
    {
        public string Alias { get; set; }

        public EnumAliasAttribute(string alias)
        {
            Alias = alias;
        }
    }
}