using AutoMapper;
using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Extensions;

namespace Meowv.Blog
{
    public class MeowvBlogApplicationAutoMapperProfile : Profile
    {
        public MeowvBlogApplicationAutoMapperProfile()
        {
            CreateMap<Post, PostDetailDto>().ForMember(x => x.CreatedAt, dto => dto.MapFrom(opt => opt.CreatedAt.FormatTime()));

            CreateMap<Category, CategoryDto>();

            CreateMap<Tag, TagDto>();
        }
    }
}