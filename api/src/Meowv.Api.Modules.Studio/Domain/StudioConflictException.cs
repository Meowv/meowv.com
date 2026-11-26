namespace Meowv.Api.Modules.Studio.Domain;

public sealed class StudioConflictException(string message) : Exception(message);