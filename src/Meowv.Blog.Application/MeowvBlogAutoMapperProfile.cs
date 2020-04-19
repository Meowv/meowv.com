using AutoMapper;
using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.Domain.Blog;

namespace Meowv.Blog.Application
{
    public class MeowvBlogAutoMapperProfile : Profile
    {
        public MeowvBlogAutoMapperProfile()
        {
            CreateMap<Post, PostDto>();
        }
    }
}