using Meowv.Blog.Domain.Signatures;
using Meowv.Blog.Extensions;
using Meowv.Blog.Options;
using Microsoft.Extensions.Options;
using System.IO;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Entities.Events;
using Volo.Abp.EventBus;

namespace Meowv.Blog.EventHandler.Signatures
{
    public class SignatureEventHandler : ILocalEventHandler<EntityCreatedEventData<Signature>>,
                                         ILocalEventHandler<EntityDeletedEventData<Signature>>,
                                         ITransientDependency
    {
        private readonly SignatureOptions _signatureOptions;

        public SignatureEventHandler(IOptions<SignatureOptions> signatureOptions)
        {
            _signatureOptions = signatureOptions.Value;
        }


        public async Task HandleEventAsync(EntityCreatedEventData<Signature> eventData)
        {
            var path = Path.Combine(_signatureOptions.Path, eventData.Entity.Url);

            if (File.Exists(path))
            {
                await path.AddWatermarkAndSaveItAsync();
            }

            await Task.CompletedTask;
        }

        public async Task HandleEventAsync(EntityDeletedEventData<Signature> eventData)
        {
            var path = Path.Combine(_signatureOptions.Path, eventData.Entity.Url);

            if (File.Exists(path))
            {
                File.Delete(path);
            }

            await Task.CompletedTask;
        }
    }
}