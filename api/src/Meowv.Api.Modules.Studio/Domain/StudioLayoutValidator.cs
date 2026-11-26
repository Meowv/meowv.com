namespace Meowv.Api.Modules.Studio.Domain;

public static class StudioLayoutValidator
{
    public static StudioLayoutValidationResult Validate(DesktopLayout layout)
    {
        ArgumentNullException.ThrowIfNull(layout);

        var result = new StudioLayoutValidationResult();

        if (layout.Pages.Count > StudioDesktopLimits.MaxPages)
            result.Error("too_many_pages", "pages", $"Layout has {layout.Pages.Count} pages; the maximum is {StudioDesktopLimits.MaxPages}.");

        if (layout.Dock.Count > StudioDesktopLimits.MaxDockItems)
            result.Error("dock_overflow", "dock", $"Dock has {layout.Dock.Count} items; the maximum is {StudioDesktopLimits.MaxDockItems}.");

        var seenIds = new Dictionary<string, string>(StringComparer.Ordinal);
        var itemCount = 0;

        for (var pageIndex = 0; pageIndex < layout.Pages.Count; pageIndex++)
        {
            var page = layout.Pages[pageIndex];
            if (page is null)
            {
                result.Error("null_page", $"pages[{pageIndex}]", "Page must be an array, not null.");
                continue;
            }

            for (var itemIndex = 0; itemIndex < page.Count; itemIndex++)
                ValidateItem(page[itemIndex], $"pages[{pageIndex}][{itemIndex}]", 1, seenIds, result, ref itemCount);
        }

        for (var dockIndex = 0; dockIndex < layout.Dock.Count; dockIndex++)
            ValidateItem(layout.Dock[dockIndex], $"dock[{dockIndex}]", 1, seenIds, result, ref itemCount);

        if (itemCount > StudioDesktopLimits.MaxItems)
            result.Error("too_many_items", "pages", $"Layout has {itemCount} items; the maximum is {StudioDesktopLimits.MaxItems}.");

        return result;
    }

    private static void ValidateItem(
        DesktopItem? item,
        string path,
        int depth,
        Dictionary<string, string> seenIds,
        StudioLayoutValidationResult result,
        ref int itemCount)
    {
        if (item is null)
        {
            result.Error("null_item", path, "Item must be an object, not null.");
            return;
        }

        itemCount++;

        if (string.IsNullOrWhiteSpace(item.Id))
            result.Error("missing_id", path, "Item id is required.");
        else if (item.Id.Length > StudioDesktopLimits.MaxIdLength)
            result.Error("id_too_long", path, $"Item id exceeds {StudioDesktopLimits.MaxIdLength} characters.");
        else if (!seenIds.TryAdd(item.Id, path)) result.Error("duplicate_id", path, $"Duplicate id '{item.Id}'; first seen at {seenIds[item.Id]}.");

        if (string.IsNullOrWhiteSpace(item.Title))
            result.Warn("empty_title", path, "Item has no title; the UI will render an empty label.");
        else if (item.Title.Length > StudioDesktopLimits.MaxTitleLength)
            result.Error("title_too_long", $"{path}.title", $"Title exceeds {StudioDesktopLimits.MaxTitleLength} characters.");

        if (item.Url is { Length: > StudioDesktopLimits.MaxUrlLength })
            result.Error("url_too_long", $"{path}.url", $"URL exceeds {StudioDesktopLimits.MaxUrlLength} characters.");

        if (item.Icon is { Length: > StudioDesktopLimits.MaxIconLength })
            result.Error("icon_too_large", $"{path}.icon", $"Icon exceeds {StudioDesktopLimits.MaxIconLength} characters.");

        ValidateExtraFields(item, path, result);

        switch (item.Type)
        {
            case DesktopItemType.Link:
            case DesktopItemType.App:
                if (item.Type == DesktopItemType.Link && item.Url is null)
                    result.Error("link_without_url", path, "Link item must have a url.");
                else if (item.Url is not null && !StudioLinkUrlPolicy.IsAllowed(item.Url, out var reason))
                    result.Error("unsafe_url", $"{path}.url", reason ?? "URL is not allowed.");

                if (item.Children is { Count: > 0 })
                    result.Warn("children_on_non_folder", path, "Only folder items may have children; the extra items will be ignored.");

                break;

            case DesktopItemType.Folder:
                if (item.Url is not null)
                    result.Warn("url_on_folder", path, "Folders do not navigate; the url will be ignored.");

                if (depth >= StudioDesktopLimits.MaxFolderDepth && item.Children is { Count: > 0 })
                {
                    result.Error("folder_too_deep", path, $"Folder nesting exceeds the maximum depth of {StudioDesktopLimits.MaxFolderDepth}.");
                    break;
                }

                if (item.Children is null) break;

                for (var childIndex = 0; childIndex < item.Children.Count; childIndex++)
                {
                    var child = item.Children[childIndex];
                    if (child is not null && ReferenceEquals(child, item))
                    {
                        result.Error("folder_cycle", $"{path}.children[{childIndex}]", "Folder cannot contain itself.");
                        continue;
                    }

                    ValidateItem(child, $"{path}.children[{childIndex}]", depth + 1, seenIds, result, ref itemCount);
                }

                break;

            case DesktopItemType.Widget:
                ValidateWidget(item, path, result);
                break;

            default:
                result.Error("unknown_type", path, $"Unknown item type '{item.Type}'.");
                break;
        }
    }

    private static void ValidateExtraFields(DesktopItem item, string path, StudioLayoutValidationResult result)
    {
        if (item.ExtraFields is null) return;

        if (item.ExtraFields.Count > StudioDesktopLimits.MaxExtraFieldCount)
            result.Error("too_many_extra_fields", path, $"Item has more than {StudioDesktopLimits.MaxExtraFieldCount} unknown fields.");

        foreach (var (key, value) in item.ExtraFields)
            if (key.Length > 64 || value.GetRawText().Length > StudioDesktopLimits.MaxExtraFieldLength)
            {
                result.Error("extra_field_too_large", $"{path}.{key}", "Unknown field is too large.");
                return;
            }
    }

    private static void ValidateWidget(DesktopItem item, string path, StudioLayoutValidationResult result)
    {
        if (item.WidgetType is null)
        {
            result.Error("widget_without_type", path, "Widget item must declare widgetType.");
            return;
        }

        if (item.WidgetSize is null)
            result.Warn("widget_without_size", path, "Widget has no size; 'medium' will be assumed.");

        if (item.WidgetOpacity is { } opacity &&
            (opacity < StudioDesktopLimits.MinWidgetOpacity || opacity > StudioDesktopLimits.MaxWidgetOpacity))
            result.Error("opacity_out_of_range", $"{path}.widgetOpacity",
                $"Opacity {opacity} is outside {StudioDesktopLimits.MinWidgetOpacity}–{StudioDesktopLimits.MaxWidgetOpacity}.");

        if (item.Url is not null)
            result.Warn("url_on_widget", path, "Widgets do not navigate; the url will be ignored.");

        if (item.WidgetType == WidgetType.StickyNote &&
            item.WidgetConfig is StickyNoteWidgetConfig sticky &&
            sticky.Content is { } content &&
            CountCodePoints(content) > StudioDesktopLimits.MaxStickyNoteCodePoints)
            result.Error("sticky_note_too_long", $"{path}.widgetConfig.content",
                $"Sticky note exceeds {StudioDesktopLimits.MaxStickyNoteCodePoints} characters.");

        if (item.WidgetConfig is not null && item.WidgetConfig.Type != item.WidgetType)
            result.Error("widget_config_mismatch", $"{path}.widgetConfig",
                $"widgetConfig type '{item.WidgetConfig.Type}' does not match widgetType '{item.WidgetType}'.");
    }

    public static int CountCodePoints(string value)
    {
        ArgumentNullException.ThrowIfNull(value);

        var count = 0;
        foreach (var _ in value.EnumerateRunes()) count++;
        return count;
    }
}