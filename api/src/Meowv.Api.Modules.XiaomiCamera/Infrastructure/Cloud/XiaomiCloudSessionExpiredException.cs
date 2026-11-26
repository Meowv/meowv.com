namespace Meowv.Api.Modules.XiaomiCamera.Infrastructure.Cloud;

public sealed class XiaomiCloudSessionExpiredException() : XiaomiCloudException("已保存的小米登录会话已失效，请重新登录。");