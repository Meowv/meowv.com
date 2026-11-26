using System.Text.Json;

namespace Meowv.Api.Modules.Studio.Infrastructure;

public sealed class StudioLayoutCodec : IStudioLayoutCodec
{
    public DesktopLayout Deserialize(string json)
    {
        return JsonSerializer.Deserialize(json, StudioJsonContext.Default.DesktopLayout) ?? new DesktopLayout();
    }

    public string Serialize(DesktopLayout layout)
    {
        return JsonSerializer.Serialize(layout, StudioJsonContext.Default.DesktopLayout);
    }
}