using Meowv.Blog.Dto.Signatures;
using Meowv.Blog.Dto.Signatures.Params;
using Meowv.Blog.Response;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Caching.Signatures
{
    public interface ISignatureCacheService : ICacheRemoveService
    {
        /// <summary>
        /// Get the list of signature types from the cache.
        /// </summary>
        /// <param name="func"></param>
        /// <returns></returns>
        Task<BlogResponse<List<SignatureTypeDto>>> GetTypesAsync(Func<Task<BlogResponse<List<SignatureTypeDto>>>> func);

        /// <summary>
        /// Generate a signature from the cache.
        /// </summary>
        /// <param name="input"></param>
        /// <param name="func"></param>
        /// <returns></returns>
        Task<BlogResponse<string>> GenerateAsync(GenerateSignatureInput input, Func<Task<BlogResponse<string>>> func);
    }
}