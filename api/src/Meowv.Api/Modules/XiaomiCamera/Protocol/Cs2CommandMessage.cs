namespace Meowv.Api.Modules.XiaomiCamera.Protocol;

public sealed record Cs2CommandMessage(int Command, byte[] Body);