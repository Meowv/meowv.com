using AutoMapper;
using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.Application.Contracts.Blog.Params;
using Meowv.Blog.Application.Contracts.HotNews;
using Meowv.Blog.Application.Contracts.Signature;
using Meowv.Blog.Application.Contracts.Wallpaper;
using Meowv.Blog.Domain.Blog;

namespace Meowv.Blog.Application
{
    /// <summary>
    /// AutoMapper实体映射配置文件
    /// </summary>
    public class MeowvBlogAutoMapperProfile : Profile
    {
        public MeowvBlogAutoMapperProfile()
        {
            CreateMap<FriendLink, FriendLinkDto>();

            CreateMap<Post, PostForAdminDto>().ForMember(x => x.Tags, opt => opt.Ignore());

            CreateMap<EditPostInput, Post>().ForMember(x => x.Id, opt => opt.Ignore());

            CreateMap<EditTagInput, Tag>().ForMember(x => x.Id, opt => opt.Ignore());

            CreateMap<EditCategoryInput, Category>().ForMember(x => x.Id, opt => opt.Ignore());

            CreateMap<EditFriendLinkInput, FriendLink>().ForMember(x => x.Id, opt => opt.Ignore());

            CreateMap<Domain.Signature.Signature, SignatureDto>();

            CreateMap<Domain.Wallpaper.Wallpaper, WallpaperDto>();

            CreateMap<WallpaperDto, Domain.Wallpaper.Wallpaper>().ForMember(x => x.Id, opt => opt.Ignore())
                                                                 .ForMember(x => x.Type, opt => opt.Ignore())
                                                                 .ForMember(x => x.CreateTime, opt => opt.Ignore());

            CreateMap<Domain.HotNews.HotNews, HotNewsDto>();
            CreateMap<HotNewsDto, Domain.HotNews.HotNews>().ForMember(x => x.Id, opt => opt.Ignore())
                                                           .ForMember(x => x.SourceId, opt => opt.Ignore())
                                                           .ForMember(x => x.CreateTime, opt => opt.Ignore());
        }
    }
}