namespace Meowv.Api.Modules.XiaomiCamera.Api.Contracts;

public sealed record CameraDescriptor(string Id, string Model, string DisplayName, string Region, bool IsOnline, int? TransportVendor);