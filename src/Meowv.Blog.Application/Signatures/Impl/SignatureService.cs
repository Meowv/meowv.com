using Meowv.Blog.Domain.Signatures;
using Meowv.Blog.Domain.Signatures.Repositories;
using Meowv.Blog.Dto.Signatures;
using Meowv.Blog.Dto.Signatures.Params;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Meowv.Blog.Signatures.Impl
{
    public partial class SignatureService : ServiceBase, ISignatureService
    {
        private readonly ISignatureRepository _signatures;

        public SignatureService(ISignatureRepository signatures)
        {
            _signatures = signatures;
        }

        /// <summary>
        /// Get the list of signature types.
        /// </summary>
        /// <returns></returns>
        [Route("api/meowv/signature/types")]
        public async Task<BlogResponse<List<SignatureTypeDto>>> GetTypesAsync()
        {
            var response = new BlogResponse<List<SignatureTypeDto>>();

            var result = Signature.KnownTypes.Dictionary.Select(x => new SignatureTypeDto
            {
                Type = x.Key,
                TypeId = x.Value
            }).ToList();

            response.Result = result;
            return await Task.FromResult(response);
        }

        /// <summary>
        /// Generate a signature.
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [Route("api/meowv/signature/generate")]
        public Task<BlogResponse<string>> GenerateAsync(GenerateSignatureInput input)
        {
            throw new System.NotImplementedException();
        }
    }
}