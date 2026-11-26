namespace Meowv.Api.Modules.Studio.Domain;

public static class StudioDesktopLimits
{
    public const int MaxLayoutJsonBytes = 2 * 1024 * 1024;
    public const int MaxPages = 100;
    public const int MaxItems = 5000;
    public const int MaxFolderDepth = 8;
    public const int MaxDockItems = 15;
    public const int MaxStickyNoteCodePoints = 1000;
    public const int MinWidgetOpacity = 0;
    public const int MaxWidgetOpacity = 100;
    public const int MaxIdLength = 128;
    public const int MaxTitleLength = 256;
    public const int MaxUrlLength = 4096;
    public const int MaxIconLength = 8192;
    public const int MaxExtraFieldCount = 32;
    public const int MaxExtraFieldLength = 2048;
    public const int MaxAvatarBytes = 2 * 1024 * 1024;
}