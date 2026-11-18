namespace Meowv.Api.Core;

public interface IAccessCodeService
{
    string? CreateIfMissing();
    string Rotate();
    bool Verify(string? code, out int version);
    int GetVersion();
}