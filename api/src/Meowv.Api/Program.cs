var builder = ApiConfiguration.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.TypeInfoResolverChain.Insert(0, ApiJsonContext.Default));
builder.Services.AddApiServices(builder.Configuration);

IReadOnlyList<Action<IServiceCollection, IConfiguration>> registers =
[
    (services, _) => services.AddHealthModule(),
    (services, _) => services.AddDiagnosticsModule(),
    (services, _) => services.AddAuthModule(),
    (services, configuration) => services.AddXiaomiCameraModule(configuration),
    (services, configuration) => services.AddChatModule(configuration),
    (services, configuration) => services.AddMusicModule(configuration),
];
foreach (var register in registers)
{
    register(builder.Services, builder.Configuration);
}

IReadOnlyList<System.Reflection.Assembly> assemblies =
[
    typeof(HealthModule).Assembly,
    typeof(DiagnosticsModule).Assembly,
    typeof(AuthModule).Assembly,
    typeof(XiaomiCameraModule).Assembly,
    typeof(ChatModule).Assembly,
    typeof(MusicModule).Assembly,
];
builder.Services.AddApiControllers([.. assemblies]);

var app = builder.Build();
app.UseExceptionHandler(errorApp => errorApp.Run(async context =>
{
    context.Response.StatusCode = StatusCodes.Status500InternalServerError;
    context.Response.Headers.CacheControl = "no-store";
    await context.Response.WriteAsJsonAsync(new ApiAuthError("internal_error", "服务暂时不可用。"), AuthJsonContext.Default.ApiAuthError, cancellationToken: context.RequestAborted);
}));
app.UseForwardedHeaders();
app.UseRouting();
app.UseCors();
app.UseRateLimiter();

foreach (var module in app.Services.GetRequiredService<IEnumerable<IEndpointModule>>())
{
    module.ConfigureMiddleware(app);
    module.MapEndpoints(app.MapGroup("").WithMetadata(new EndpointModuleMetadata(module.Name)));
}

app.MapApiControllers();

app.UseAuthentication();
app.UseAuthorization();
app.Run();