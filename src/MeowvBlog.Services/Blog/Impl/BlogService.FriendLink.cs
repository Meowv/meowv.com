using MeowvBlog.Core.Domain.Blog;
using MeowvBlog.Services.Dto.Blog;
using Plus;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Blog.Impl
{
    public partial class BlogService
    {
        /// <summary>
        /// 新增友链
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> InsertFriendLink(FriendLinkDto dto)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<string>();

                var friendLink = new FriendLink
                {
                    Id = GenerateGuid(),
                    Title = dto.Title,
                    LinkUrl = dto.LinkUrl
                };

                var result = await _friendLinkRepository.InsertAsync(friendLink);
                await uow.CompleteAsync();

                if (result.IsNull())
                    output.AddError("新增友链出错了~~~");
                else
                    output.Result = "success";

                return output;
            }
        }

        /// <summary>
        /// 友链列表
        /// </summary>
        /// <returns></returns>
        public async Task<ActionOutput<IList<FriendLinkDto>>> QueryFriendLinks()
        {
            var output = new ActionOutput<IList<FriendLinkDto>>();

            var friendLink = await _friendLinkRepository.GetAllListAsync();

            var result = friendLink.Select(x => new FriendLinkDto
            {
                Title = x.Title,
                LinkUrl = x.LinkUrl
            }).ToList();

            output.Result = result;

            return output;
        }
    }
}