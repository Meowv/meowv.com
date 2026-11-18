namespace Meowv.Api.Modules.XiaomiCamera.Cloud;

public class XiaomiCloudException(string message, Exception? innerException = null) : Exception(message, innerException);