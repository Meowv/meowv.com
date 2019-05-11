using AutoMapper;
using System;

namespace MeowvBlog.AutoMapper
{
    public abstract class AutoMapAttributeBase : Attribute
    {
        public Type[] TargetTypes { get; set; }

        protected AutoMapAttributeBase(params Type[] targetTypes)
        {
            TargetTypes = targetTypes;
        }

        public abstract void CreateMap(IMapperConfigurationExpression configuration, Type type);
    }
}