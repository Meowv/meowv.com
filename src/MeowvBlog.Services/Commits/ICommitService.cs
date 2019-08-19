using MeowvBlog.Services.Dto;
using MeowvBlog.Services.Dto.Commits;
using Plus;
using Plus.Services.Dto;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Commits
{
    public interface ICommitService
    {
        /// <summary>
        /// 批量保存Commit记录
        /// </summary>
        /// <param name="dtos"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> BulkInsertCommits(IList<CommitDto> dtos);

        /// <summary>
        /// 分页查询Commit记录
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<PagedResultDto<CommitDto>> QueryCommits(PagingInput input);
    }
}