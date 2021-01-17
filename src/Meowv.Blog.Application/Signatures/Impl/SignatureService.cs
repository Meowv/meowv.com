using Meowv.Blog.Domain.Signatures.Repositories;

namespace Meowv.Blog.Signatures.Impl
{
    public partial class SignatureService : ServiceBase, ISignatureService
    {
        private readonly ISignatureRepository _signatures;

        public SignatureService(ISignatureRepository signatures)
        {
            _signatures = signatures;
        }
    }
}