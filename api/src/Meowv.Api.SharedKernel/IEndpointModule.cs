using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Builder;

namespace Meowv.Api.SharedKernel;

public interface IEndpointModule
{
    string Name { get; }

    string Description { get; }

    void ConfigureMiddleware(IApplicationBuilder application)
    {
    }

    void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
    }
}