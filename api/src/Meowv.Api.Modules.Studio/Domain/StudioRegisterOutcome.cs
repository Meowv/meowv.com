namespace Meowv.Api.Modules.Studio.Domain;

public sealed record StudioRegisterOutcome(bool RequiresVerification, StudioAuthSession? Session);