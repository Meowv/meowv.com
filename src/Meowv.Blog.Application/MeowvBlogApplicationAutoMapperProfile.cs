using AutoMapper;
using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Domain.News;
using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Dto.News.Params;
using Meowv.Blog.Extensions;

namespace Meowv.Blog
{
    public class MeowvBlogApplicationAutoMapperProfile : Profile
    {
        public MeowvBlogApplicationAutoMapperProfile()
        {
            CreateMap<Post, PostDto>()
                .ForMember(x => x.CreatedAt, dto => dto.MapFrom(opt => opt.CreatedAt.ToLocalTime()));

            CreateMap<Post, PostDetailDto>()
                .ForMember(x => x.CreatedAt, dto => dto.MapFrom(opt => opt.CreatedAt.ToLocalTime().FormatTime()));

            CreateMap<Post, PostBriefDto>()
                .ForMember(x => x.CreatedAt, dto => dto.MapFrom(opt => opt.CreatedAt.ToLocalTime().FormatTime()))
                .ForMember(x => x.Year, dto => dto.MapFrom(opt => opt.CreatedAt.Year));

            CreateMap<Post, PostBriefAdminDto>()
                .ForMember(x => x.CreatedAt, dto => dto.MapFrom(opt => opt.CreatedAt.ToLocalTime().FormatTime()))
                .ForMember(x => x.Year, dto => dto.MapFrom(opt => opt.CreatedAt.Year));

            CreateMap<Category, CategoryDto>();

            CreateMap<Category, GetAdminCategoryDto>();

            CreateMap<Tag, TagDto>();

            CreateMap<Tag, GetAdminTagDto>();

            CreateMap<FriendLink, FriendLinkDto>();

            CreateMap<FriendLink, GetAdminFriendLinkDto>();

            CreateMap<Hot, HotDto>()
                .ForMember(x => x.CreatedAt, dto => dto.MapFrom(opt => opt.CreatedAt.ToLocalTime()));
        }
    }
}