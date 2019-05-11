using AutoMapper;
using System;
using System.Collections.Generic;

namespace MeowvBlog.AutoMapper
{
    public interface IAutoMapperConfiguration
    {
        List<Action<IMapperConfigurationExpression>> Configurators { get; }

        bool UseStaticMapper { get; set; }
    }
}