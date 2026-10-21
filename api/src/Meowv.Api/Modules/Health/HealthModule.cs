using Meowv.Api.Core;

namespace Meowv.Api.Modules.Health;

public sealed class HealthModule : IEndpointModule
{
    public string Name => "health";

    public string Description => "服务存活探针。";

    public void MapEndpoints(IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/api/health", () => Results.Json(new HealthResponse("healthy"), HealthJsonContext.Default.HealthResponse));
}

public sealed record HealthResponse(string Status);