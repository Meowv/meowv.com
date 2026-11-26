using System.Net;
using System.Net.Mail;

namespace Meowv.Api.Modules.Studio.Infrastructure;

public sealed partial class StudioSmtpEmailSender(StudioSmtpOptions options, ILogger<StudioSmtpEmailSender> logger) : IStudioEmailSender
{
    public bool IsConfigured => options.IsConfigured;

    public async Task SendAsync(StudioOutboxMessage message, CancellationToken cancellationToken)
    {
        if (!IsConfigured) throw new InvalidOperationException("SMTP is not configured.");

        using var mail = new MailMessage();
        mail.From = new MailAddress(options.From, options.FromName ?? "Studio");
        mail.Subject = message.Subject;
        mail.Body = message.HtmlBody;
        mail.IsBodyHtml = true;
        mail.To.Add(new MailAddress(message.Recipient));

        using var client = new SmtpClient(options.Host, options.Port);
        client.EnableSsl = string.Equals(options.Security, "StartTls", StringComparison.OrdinalIgnoreCase);
        client.DeliveryMethod = SmtpDeliveryMethod.Network;

        if (!string.IsNullOrEmpty(options.Username))
            client.Credentials = new NetworkCredential(options.Username, options.Password ?? string.Empty);

        await client.SendMailAsync(mail, cancellationToken);
        LogSent(message.Purpose.ToString());
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Sent Studio {Purpose} email.")]
    private partial void LogSent(string purpose);
}