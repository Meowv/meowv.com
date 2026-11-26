namespace Meowv.Api.Modules.XiaomiCamera.Infrastructure.Cloud;

public class XiaomiCloudException(string message, Exception? innerException = null) : Exception(message, innerException);