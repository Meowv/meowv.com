using Meowv.Api;
using Meowv.Api.Core;
using Meowv.Api.Infrastructure;
using Meowv.Api.Security;

var builder = ApiConfiguration.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.TypeInfoResolverChain.Insert(0, ApiJsonContext.Default));
builder.Services.AddApiServices(builder.Configuration);

foreach (var register in ModuleCatalog.Registrations)
{
    register(builder.Services, builder.Configuration);
}

var app = builder.Build();
app.UseForwardedHeaders();
app.UseRouting();
app.UseCors();
app.UseRateLimiter();

foreach (var module in app.Services.GetRequiredService<IEnumerable<IEndpointModule>>())
{
    module.ConfigureMiddleware(app);
    module.MapEndpoints(app.MapGroup("").WithMetadata(new EndpointModuleMetadata(module.Name)));
}

app.UseAuthentication();
app.UseAuthorization();
app.Run();
