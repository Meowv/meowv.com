using System.Text;

namespace Meowv.Api.Modules.Studio.Application;

public sealed class StudioLayoutService(
    IStudioStore store,
    IStudioLayoutCodec codec,
    IStudioClock clock)
{
    public async Task<LayoutEnvelope> GetEnvelopeAsync(Guid userId, CancellationToken cancellationToken)
    {
        var row = await store.GetLayoutAsync(userId, cancellationToken);
        return Envelope(row);
    }

    public async Task<StudioAccountResult<StudioLayoutOperationResult>> PutAsync(
        Guid userId,
        DesktopLayout layout,
        long expectedRevision,
        CancellationToken cancellationToken)
    {
        var validation = StudioLayoutValidator.Validate(layout);
        if (!validation.IsValid)
        {
            var first = validation.Errors.First();
            return StudioAccountResult<StudioLayoutOperationResult>.Failure(first.Code, first.Message);
        }

        var json = codec.Serialize(layout);
        if (Encoding.UTF8.GetByteCount(json) > StudioDesktopLimits.MaxLayoutJsonBytes)
            return StudioAccountResult<StudioLayoutOperationResult>.Failure(StudioErrorCodes.PayloadTooLarge, "布局超过 2 MiB 上限。");

        var result = await store.PutLayoutAsync(userId, json, expectedRevision, clock.UtcNow, cancellationToken);
        return StudioAccountResult<StudioLayoutOperationResult>.Success(new StudioLayoutOperationResult
        {
            Status = result.Status,
            Envelope = Envelope(result.Current)
        });
    }

    private LayoutEnvelope Envelope(StudioLayout? row)
    {
        return row is null
            ? new LayoutEnvelope { Layout = null, UpdatedAt = null, Revision = 0, Exists = false }
            : new LayoutEnvelope
            {
                Layout = codec.Deserialize(row.Json),
                UpdatedAt = row.UpdatedAt,
                Revision = row.Revision,
                Exists = true
            };
    }
}