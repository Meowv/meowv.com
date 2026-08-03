export const siteConfig = {
  name: "在线 PDF 处理",
  shortName: "无需登录 · 数据不上传",
  url: "https://pdf.meowv.com",
  description:
    "免费的在线 PDF 处理工具，支持 PDF 合并、拆分、页面整理、删除、提取、旋转、图片转 PDF、PDF 转图片、水印和页码。无需登录，文件不上传，所有处理均在浏览器本地完成。",
  links: {
    worksheet: "https://zt.meowv.com",
    excel: "https://excel.meowv.com",
    markdown: "https://md.meowv.com"
  },
  donationMethods: [
    {
      name: "支付宝",
      hint: "打开支付宝扫一扫",
      image: "https://meowv.com/medias/reward/alipay.png"
    },
    {
      name: "微信",
      hint: "打开微信扫一扫",
      image: "https://meowv.com/medias/reward/wechat.png"
    }
  ]
} as const;
