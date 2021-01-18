using Meowv.Blog.Dto.Signatures;
using Meowv.Blog.Dto.Signatures.Params;
using Meowv.Blog.Response;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Caching.Signatures.Impl
{
    public class SignatureCacheService : CachingServiceBase, ISignatureCacheService
    {
        public async Task<BlogResponse<List<SignatureTypeDto>>> GetTypesAsync(Func<Task<BlogResponse<List<SignatureTypeDto>>>> func) => await Cache.GetOrAddAsync(CachingConsts.CacheKeys.GetSignatureTypesAsync(), func, CachingConsts.CacheStrategy.ONE_HOURS);

        public async Task<BlogResponse<string>> GenerateAsync(GenerateSignatureInput input, Func<Task<BlogResponse<string>>> func) => await Cache.GetOrAddAsync(CachingConsts.CacheKeys.GenerateSignatureAsync(input.Name, input.TypeId), func, CachingConsts.CacheStrategy.ONE_HOURS);
    }
}