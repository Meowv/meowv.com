using MeowvBlog.Core.Domain.Commits.Repositories;
using MeowvBlog.Services.Dto;
using MeowvBlog.Services.Dto.Commits;
using Plus;
using Plus.Services.Dto;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Commits.Impl
{
    public class CommitService : ServiceBase, ICommitService
    {
        private readonly ICommitRepository _commitRepository;

        public CommitService(ICommitRepository commitRepository)
        {
            _commitRepository = commitRepository;
        }

        /// <summary>
        /// 批量保存Commit记录
        /// </summary>
        /// <param name="dtos"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> BulkInsertCommits(IList<CommitDto> dtos)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<string>();

                var commits = dtos.Select(x => new Core.Domain.Commits.Commit
                {
                    Id = GenerateGuid(),
                    Sha = x.Sha,
                    Message = x.Message,
                    Date = x.Date.ToDateTime()
                }).ToList();

                var allCommits = await _commitRepository.GetAllListAsync();

                commits = commits.Where(x => !allCommits.Select(c => c.Sha).Contains(x.Sha)).ToList();

                if (!commits.Any())
                {
                    output.AddError("没有新的Commit记录");
                    return output;
                }

                var result = await _commitRepository.BulkInsertCommitAsync(commits);

                await uow.CompleteAsync();

                if (result)
                    output.Result = "success";
                else
                    output.AddError("新增Commit出错了~~~");

                return output;
            }
        }

        /// <summary>
        /// 分页查询Commit记录
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<PagedResultDto<CommitDto>> QueryCommits(PagingInput input)
        {
            var query = await _commitRepository.GetAllListAsync();
            var count = query.Count();

            var result = query.Select(x => new CommitDto
            {
                Sha = x.Sha,
                Message = x.Message,
                Date = x.Date.ToString("yyyy-MM-dd HH:mm:ss")
            }).OrderByDescending(x => x.Date).PageByIndex(input.Page, input.Limit).ToList();

            return new PagedResultDto<CommitDto>(count, result);
        }
    }
}