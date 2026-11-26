namespace Meowv.Api.Modules.Studio.Application.Ports;

public interface IStudioOneTimeTokenService
{
    string CreateToken();

    string Hash(string token);
}