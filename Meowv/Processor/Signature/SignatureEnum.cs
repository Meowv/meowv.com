using System.ComponentModel;

namespace Meowv.Processor.Signature
{
    /// <summary>
    /// 签名类型
    /// </summary>
    public enum SignatureEnum
    {
        /// <summary>
        /// 艺术签
        /// </summary>
        [Description("艺术签")]
        _art = 901,

        /// <summary>
        /// 商务签
        /// </summary>
        [Description("商务签")]
        _biz = 905
    }
}