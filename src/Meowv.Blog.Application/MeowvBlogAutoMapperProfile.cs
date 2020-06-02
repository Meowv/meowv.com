using AutoMapper;
using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.Application.Contracts.Blog.Params;
using Meowv.Blog.Domain.Blog;

namespace Meowv.Blog.Application
{
    public class MeowvBlogAutoMapperProfile : Profile
    {
        public MeowvBlogAutoMapperProfile()
        {
            CreateMap<FriendLink, FriendLinkDto>();

            CreateMap<EditPostInput, Post>().ForMember(x => x.Id, opt => opt.Ignore());
        }
    }
}