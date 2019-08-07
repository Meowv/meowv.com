using MeowvBlog.Services.Dto;
using MeowvBlog.Services.Dto.NiceArticle;
using Plus;
using Plus.Services.Dto;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Services.NiceArticle
{
    public interface INiceArticleService
    {
        /// <summary>
        /// 批量新增好文
        /// </summary>
        /// <param name="dtos"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> BulkInsertNiceArticle(IList<NiceArticleDto> dtos);

        /// <summary>
        /// 新增好文
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> InsertNiceArticle(NiceArticleDto dto);

        /// <summary>
        /// 分页查询好文
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<PagedResultDto<QueryNiceArticleDto>> QueryNicceArticle(PagingInput input);
    }
}