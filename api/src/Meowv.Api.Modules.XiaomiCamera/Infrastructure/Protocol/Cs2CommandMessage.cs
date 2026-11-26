namespace Meowv.Api.Modules.XiaomiCamera.Infrastructure.Protocol;

public sealed record Cs2CommandMessage(int Command, byte[] Body);