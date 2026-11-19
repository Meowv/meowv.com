using Meowv.Api.Core;
using Microsoft.AspNetCore.Authorization;

namespace Meowv.Api.Modules.Health;

public sealed class HealthModule : IEndpointModule
{
    public string Name => "health";

    public string Description => "服务存活探针。";

    public void MapEndpoints(IEndpointRouteBuilder endpoints) => endpoints
        .MapGet("/api/health", () => Results.Json(new HealthResponse("healthy"), HealthJsonContext.Default.HealthResponse))
        .WithSummary("服务存活探针，固定返回 healthy。")
        .AllowAnonymous();
}