export interface Poem {
  title: string;
  author: string;
  content: string;
}

export const CLASSIC_SEVEN_CHARACTER_POEMS: readonly Poem[] = [
  {
    title: "泊船瓜洲",
    author: "王安石",
    content: "京口瓜洲一水间，钟山只隔数重山。春风又绿江南岸，明月何时照我还。",
  },
  {
    title: "枫桥夜泊",
    author: "张继",
    content: "月落乌啼霜满天，江枫渔火对愁眠。姑苏城外寒山寺，夜半钟声到客船。",
  },
  {
    title: "早发白帝城",
    author: "李白",
    content: "朝辞白帝彩云间，千里江陵一日还。两岸猿声啼不住，轻舟已过万重山。",
  },
  {
    title: "饮湖上初晴后雨",
    author: "苏轼",
    content: "水光潋滟晴方好，山色空蒙雨亦奇。欲把西湖比西子，淡妆浓抹总相宜。",
  },
  {
    title: "山行",
    author: "杜牧",
    content: "远上寒山石径斜，白云生处有人家。停车坐爱枫林晚，霜叶红于二月花。",
  },
  {
    title: "黄鹤楼送孟浩然之广陵",
    author: "李白",
    content: "故人西辞黄鹤楼，烟花三月下扬州。孤帆远影碧空尽，唯见长江天际流。",
  },
  {
    title: "夜雨寄北",
    author: "李商隐",
    content: "君问归期未有期，巴山夜雨涨秋池。何当共剪西窗烛，却话巴山夜雨时。",
  },
  {
    title: "游园不值",
    author: "叶绍翁",
    content: "应怜屐齿印苍苔，小扣柴扉久不开。春色满园关不住，一枝红杏出墙来。",
  },
  {
    title: "咏柳",
    author: "贺知章",
    content: "碧玉妆成一树高，万条垂下绿丝绦。不知细叶谁裁出，二月春风似剪刀。",
  },
  {
    title: "乌衣巷",
    author: "刘禹锡",
    content: "朱雀桥边野草花，乌衣巷口夕阳斜。旧时王谢堂前燕，飞入寻常百姓家。",
  },
  {
    title: "登飞来峰",
    author: "王安石",
    content: "飞来山上千寻塔，闻说鸡鸣见日升。不畏浮云遮望眼，自缘身在最高层。",
  },
];

export function getRandomPoem(): Poem {
  const poem = CLASSIC_SEVEN_CHARACTER_POEMS[
    Math.floor(Math.random() * CLASSIC_SEVEN_CHARACTER_POEMS.length)
  ];

  if (!poem) throw new Error("诗词配置不能为空。");
  return poem;
}
