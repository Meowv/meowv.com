namespace Meowv.Api.Modules.XiaomiCamera.Protocol;

public static class Cs2MessageType
{
    public const byte ListRequest = 0x67;
    public const byte RelayHello = 0x70;
    public const byte RelayHelloAcknowledged = 0x71;
    public const byte RelayPort = 0x72;
    public const byte RelayPortAcknowledged = 0x73;
    public const byte RelayRequest = 0x80;
    public const byte RelayTo = 0x82;
    public const byte RelayPacket = 0x83;
    public const byte RelayReady = 0x84;
    public const byte MissSetup = 0x28;
    public const byte Drw = 0xD0;
    public const byte DrwAcknowledged = 0xD1;
    public const byte Alive = 0xE0;
    public const byte AliveAcknowledged = 0xE1;
    public const byte Close = 0xF0;
}