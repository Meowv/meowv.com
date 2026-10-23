const animals = [
  '小猫',
  '小熊',
  '鲸鱼',
  '小鹿',
  '狐狸',
  '企鹅',
  '兔子',
  '树懒',
  '水獭',
  '海豹',
  '松鼠',
  '熊猫',
] as const;

const styles = [
  {
    prefixes: [
      '月光里的',
      '星河边的',
      '云朵上的',
      '听雨的',
      '追星星的',
      '看海的',
      '等晚风的',
      '抱着月亮的',
      '藏着星光的',
      '收集日落的',
      '漫游银河的',
      '和云散步的',
      '给月亮写信的',
      '路过人间的',
      '在云上发呆的',
      '住在森林的',
    ],
    nouns: animals,
  },
  {
    prefixes: [
      '慢半拍的',
      '不想早起的',
      '偷偷打盹的',
      '有点迷糊的',
      '想喝奶茶的',
      '刚刚睡醒的',
      '认真摸鱼的',
      '喜欢发呆的',
      '正在放空的',
      '没睡饱的',
      '有点社恐的',
      '今天很开心的',
      '自带好运的',
      '偶尔靠谱的',
      '爱吃甜食的',
      '周末营业的',
    ],
    nouns: animals,
  },
  {
    prefixes: [
      '薄荷味的',
      '柠檬味的',
      '橘子味的',
      '奶油味的',
      '蜂蜜味的',
      '草莓味的',
      '香草味的',
      '海盐味的',
      '桃子味的',
      '桂花味的',
      '抹茶味的',
      '乌龙味的',
      '焦糖味的',
      '椰子味的',
      '葡萄味的',
      '青柠味的',
    ],
    nouns: [
      '晚风',
      '云朵',
      '星星',
      '月亮',
      '小熊',
      '小猫',
      '鲸鱼',
      '小鹿',
      '狐狸',
      '企鹅',
      '汽水',
      '布丁',
    ],
  },
] as const;

export function generateChatNickname(previous = ''): string {
  const style = styles[Math.floor(Math.random() * styles.length)]!;
  const prefix = style.prefixes[Math.floor(Math.random() * style.prefixes.length)]!;
  let nounIndex = Math.floor(Math.random() * style.nouns.length);
  if (prefix + style.nouns[nounIndex] === previous)
    nounIndex = (nounIndex + 1) % style.nouns.length;
  return prefix + style.nouns[nounIndex];
}
