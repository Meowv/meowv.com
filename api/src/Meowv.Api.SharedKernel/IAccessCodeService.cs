namespace Meowv.Api.SharedKernel;

public interface IAccessCodeService
{
    string? CreateIfMissing();
    string Rotate();
    bool Verify(string? code, out int version);
    int GetVersion();
}