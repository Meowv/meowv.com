using HttpJsonOptions = Microsoft.AspNetCore.Http.Json.JsonOptions;
using MvcJsonOptions = Microsoft.AspNetCore.Mvc.JsonOptions;

namespace Meowv.Api.Platform.Hosting;

internal sealed class SyncMvcJsonOptions(IOptions<HttpJsonOptions> http) : IPostConfigureOptions<MvcJsonOptions>
{
    public void PostConfigure(string? name, MvcJsonOptions options)
    {
        foreach (var resolver in http.Value.SerializerOptions.TypeInfoResolverChain)
            if (!options.JsonSerializerOptions.TypeInfoResolverChain.Contains(resolver))
                options.JsonSerializerOptions.TypeInfoResolverChain.Add(resolver);
    }
}