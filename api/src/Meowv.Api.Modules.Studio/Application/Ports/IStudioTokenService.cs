namespace Meowv.Api.Modules.Studio.Application.Ports;

public interface IStudioTokenService
{
    StudioIssuedToken Issue(StudioUser user, DateTimeOffset now);
}