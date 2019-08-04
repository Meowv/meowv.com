using MeowvBlog.Core.Domain.Signature;
using MeowvBlog.Core.Domain.Signature.Repositories;
using MeowvBlog.Services.Dto.Signature;
using Plus;
using Plus.AutoMapper;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Signature.Impl
{
    public class SignatureLogService : ServiceBase, ISignatureLogService
    {
        private readonly ISignatureLogRepository _signatureLogRepository;

        public SignatureLogService(ISignatureLogRepository signatureLogRepository)
        {
            _signatureLogRepository = signatureLogRepository;
        }

        /// <summary>
        /// 新增标签日志
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> InsertSignatureLog(SignatureDto dto)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<string>();

                var log = new SignatureLog
                {
                    Name = dto.Name,
                    Type = dto.Type,
                    Url = dto.Url,
                    Ip = dto.Ip,
                    Time = DateTime.Now
                };

                var result = await _signatureLogRepository.InsertAsync(log);
                await uow.CompleteAsync();

                if (result.IsNull())
                    output.AddError("新增标签出错了~~~");
                else
                    output.Result = "success";

                return output;
            }
        }

        /// <summary>
        /// 获取最近生成的签名数据
        /// </summary>
        /// <returns></returns>
        public async Task<ActionOutput<SignatureDto>> GetRecentlySignatureLog()
        {
            var output = new ActionOutput<SignatureDto>();

            var log = (await _signatureLogRepository.GetAllListAsync()).OrderByDescending(x => x.Time).Take(20).ToList();

            output.Result = log.MapTo<SignatureDto>();

            return output;
        }
    }
}