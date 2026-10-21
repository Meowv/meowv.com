using Meowv.Api.Core;
using Meowv.Api.Modules.Diagnostics;
using Meowv.Api.Modules.Health;
using Meowv.Api.Modules.Auth;
using Meowv.Api.Modules.XiaomiCamera;

namespace Meowv.Api;

public static class ModuleCatalog
{
    public static IReadOnlyList<Action<IServiceCollection, IConfiguration>> Registrations { get; } =
    [
        (services, _) => services.AddSingleton<IEndpointModule, HealthModule>(),
        (services, _) => services.AddSingleton<IEndpointModule, DiagnosticsModule>(),
        (services, _) => services.AddSingleton<IEndpointModule, AuthModule>(),
        (services, configuration) => services.AddXiaomiCameraModule(configuration),
    ];
}