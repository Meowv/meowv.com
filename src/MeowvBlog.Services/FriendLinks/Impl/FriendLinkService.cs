using MeowvBlog.Core.Domain.FriendLinks.Repositories;
using MeowvBlog.Services.Dto.FriendLinks;
using System.Collections.Generic;
using System.Threading.Tasks;
using UPrime;
using UPrime.AutoMapper;

namespace MeowvBlog.Services.FriendLinks.Impl
{
    /// <summary>
    /// 友情链接服务接口实现
    /// </summary>
    public class FriendLinkService : ServiceBase, IFriendLinkService
    {
        private readonly IFriendLinkRepository _friendLinkRepository;

        public FriendLinkService(IFriendLinkRepository friendLinkRepository)
        {
            _friendLinkRepository = friendLinkRepository;
        }

        /// <summary>
        /// 友情链接列表
        /// </summary>
        /// <returns></returns>
        public async Task<ActionOutput<IList<FriendLinkDto>>> GetAsync()
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<IList<FriendLinkDto>>();

                var query = await _friendLinkRepository.GetAllListAsync();

                await uow.CompleteAsync();

                output.Result = query.MapTo<IList<FriendLinkDto>>();

                return output;
            }
        }
    }
}