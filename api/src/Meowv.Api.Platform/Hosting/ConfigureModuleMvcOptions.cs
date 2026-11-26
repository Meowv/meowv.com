using Microsoft.AspNetCore.Mvc;

namespace Meowv.Api.Platform.Hosting;

internal sealed class ConfigureModuleMvcOptions(IServiceProvider services) : IConfigureOptions<MvcOptions>
{
    public void Configure(MvcOptions options)
        => options.Conventions.Add(new ModuleEndpointMetadataConvention(services));
}