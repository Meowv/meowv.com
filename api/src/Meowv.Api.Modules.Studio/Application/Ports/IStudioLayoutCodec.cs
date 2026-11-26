namespace Meowv.Api.Modules.Studio.Application.Ports;

public interface IStudioLayoutCodec
{
    DesktopLayout Deserialize(string json);

    string Serialize(DesktopLayout layout);
}