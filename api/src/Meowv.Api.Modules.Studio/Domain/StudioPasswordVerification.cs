namespace Meowv.Api.Modules.Studio.Domain;

public readonly record struct StudioPasswordVerification(bool Success, bool NeedsRehash);