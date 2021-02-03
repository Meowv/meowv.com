using AutoMapper;
using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Domain.Hots;
using Meowv.Blog.Domain.Messages;
using Meowv.Blog.Domain.Sayings;
using Meowv.Blog.Domain.Signatures;
using Meowv.Blog.Domain.Users;
using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Dto.Hots;
using Meowv.Blog.Dto.Messages;
using Meowv.Blog.Dto.Sayings;
using Meowv.Blog.Dto.Signatures;
using Meowv.Blog.Dto.Users;
using Meowv.Blog.Extensions;

namespace Meowv.Blog
{
    public class MeowvBlogApplicationAutoMapperProfile : Profile
    {
        public MeowvBlogApplicationAutoMapperProfile()
        {
            CreateMap<Post, PostDto>().ForMember(x => x.CreatedAt, dto => dto.MapFrom(opt => opt.CreatedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss")));

            CreateMap<Post, PostDetailDto>().ForMember(x => x.CreatedAt, dto => dto.MapFrom(opt => opt.CreatedAt.ToLocalTime().FormatTime()));

            CreateMap<Post, PostBriefDto>()
                .ForMember(x => x.CreatedAt, dto => dto.MapFrom(opt => opt.CreatedAt.ToLocalTime().FormatTime()))
                .ForMember(x => x.Year, dto => dto.MapFrom(opt => opt.CreatedAt.Year));

            CreateMap<Post, GetAdminPostDto>().ForMember(x => x.CreatedAt, dto => dto.MapFrom(opt => opt.CreatedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss")));

            CreateMap<Category, CategoryDto>();

            CreateMap<Category, GetAdminCategoryDto>();

            CreateMap<Category, CategoryAdminDto>();

            CreateMap<Tag, TagDto>();

            CreateMap<Tag, GetAdminTagDto>();

            CreateMap<Tag, TagAdminDto>();

            CreateMap<FriendLink, FriendLinkDto>();

            CreateMap<FriendLink, GetAdminFriendLinkDto>();

            CreateMap<Hot, HotSourceDto>();

            CreateMap<Hot, HotDto>().ForMember(x => x.CreatedAt, dto => dto.MapFrom(opt => opt.CreatedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss")));

            CreateMap<Saying, SayingDto>();

            CreateMap<Signature, SignatureDto>().ForMember(x => x.CreatedAt, dto => dto.MapFrom(opt => opt.CreatedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss")));

            CreateMap<Message, MessageDto>().ForMember(x => x.CreatedAt, dto => dto.MapFrom(opt => opt.CreatedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss")));

            CreateMap<MessageReply, MessageReplyDto>().ForMember(x => x.CreatedAt, dto => dto.MapFrom(opt => opt.CreatedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss")));

            CreateMap<User, UserDto>().ForMember(x => x.CreatedAt, dto => dto.MapFrom(opt => opt.CreatedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss")));
        }
    }
}