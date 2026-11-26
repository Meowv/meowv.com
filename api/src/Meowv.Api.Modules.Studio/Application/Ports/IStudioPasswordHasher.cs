namespace Meowv.Api.Modules.Studio.Application.Ports;

public interface IStudioPasswordHasher
{
    string Hash(string password);

    StudioPasswordVerification Verify(string password, string storedHash);
}