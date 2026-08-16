<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  IconBook,
  IconBook2,
  IconCopy,
  IconDownload,
  IconHistory,
  IconRefresh,
  IconShare3,
  IconTrash,
  IconX,
} from '@tabler/icons-vue';
import QRCode from 'qrcode';
import answerData from './answer-book.json';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';

const themes = [
  { id: 'life', name: '人生', subtitle: '给愿意慢慢生活的人' },
  { id: 'love', name: '爱情', subtitle: '给认真感受的人' },
  { id: 'career', name: '职场', subtitle: '给正在前进的人' },
  { id: 'developer', name: '程序员', subtitle: '给解决问题的人' },
  { id: 'today', name: '今日指引', subtitle: '给今天的你' },
  { id: 'midnight', name: '深夜时刻', subtitle: '给还没入睡的人' },
] as const;

type ThemeId = (typeof themes)[number]['id'];
type AnswerMode = 'random' | 'daily';
type BookPhase = 'closed' | 'opening' | 'open' | 'turning' | 'closing';

interface Answer {
  id: string;
  theme: ThemeId;
  text: string;
  tone: string;
}

interface HistoryItem {
  id: string;
  question: string;
  answerId: string;
  answerText: string;
  theme: ThemeId;
  mode: AnswerMode;
  createdAt: string;
}

interface RecentItem {
  theme: ThemeId;
  answerId: string;
}

const keys = {
  user: `${STORAGE_POLICY.preferences}:answer-book-user`,
  history: `${STORAGE_POLICY.preferences}:answer-book-history`,
  recent: `${STORAGE_POLICY.preferences}:answer-book-recent`,
};
const SHARE_URL = 'https://studio.meowv.com/tools/answer-book';
const answers = Object.fromEntries(
  themes.map((item) => [
    item.id,
    answerData[item.id].map((answer, index) =>
      typeof answer === 'string'
        ? {
            id: `${item.id}-${index + 1}`,
            theme: item.id,
            text: answer,
            tone: ['gentle', 'positive', 'action', 'caution', 'humor'][index % 5],
          }
        : { ...answer, theme: item.id },
    ),
  ]),
) as Record<ThemeId, Answer[]>;

const theme = ref<ThemeId>('life');
const mode = ref<AnswerMode>('random');
const question = ref('');
const answer = ref<Answer | null>(null);
const turningAnswer = ref<Answer | null>(null);
const answeredQuestion = ref('');
const answeredAt = ref<Date | null>(null);
const phase = ref<BookPhase>('closed');
const pageResetting = ref(false);
const hint = ref('在心里默念你的问题');
const resultStatus = ref('尚未揭晓');
const notice = ref('');
const history = ref<HistoryItem[]>([]);
const recent = ref<RecentItem[]>([]);
const historyVisible = ref(false);
const shareVisible = ref(false);
const shareQuestion = ref(true);
const shareReady = ref(false);
const shareNotice = ref('正在制作你的答案明信片…');
const shareDownloadUrl = ref('');
const shareDownloadObjectUrl = ref(false);
const storageEnabled = ref(true);
const bookRef = ref<HTMLElement | null>(null);
const turningPageRef = ref<HTMLElement | null>(null);
const coverRef = ref<HTMLElement | null>(null);
const shareCanvasRef = ref<HTMLCanvasElement | null>(null);
const historyCloseRef = ref<HTMLButtonElement | null>(null);
const shareCloseRef = ref<HTMLButtonElement | null>(null);
const activeTheme = computed(() => getTheme(theme.value));
const busy = computed(() => ['opening', 'turning', 'closing'].includes(phase.value));
const bookClasses = computed(() => ({
  'is-opening': phase.value === 'opening',
  'is-open': phase.value === 'open',
  'is-turning': phase.value === 'turning',
  'is-closing': phase.value === 'closing',
  'is-page-resetting': pageResetting.value,
}));
const primaryLabel = computed(() => {
  if (phase.value === 'opening' || phase.value === 'turning') return '正在翻页';
  if (phase.value === 'closing') return '正在合书';
  if (phase.value === 'open') return '再问一次';
  return mode.value === 'daily' ? '揭晓今日答案' : '翻开答案之书';
});

let noticeTimer: number | null = null;
let motionToken = 0;
let shareRenderToken = 0;
let layerTrigger: HTMLElement | null = null;
let previousBodyOverflow = '';
const motionCleanups = new Set<() => void>();

function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && themes.some((item) => item.id === value);
}

function isAnswerMode(value: unknown): value is AnswerMode {
  return value === 'random' || value === 'daily';
}

function getTheme(id: ThemeId): (typeof themes)[number] {
  return themes.find((item) => item.id === id) ?? themes[0];
}

function answerTextSize(text?: string): 'short' | 'medium' | 'long' {
  const length = Array.from(text ?? '').length;
  if (length <= 12) return 'short';
  if (length <= 16) return 'medium';
  return 'long';
}

function currentQuestion(): string {
  return mode.value === 'random' ? question.value.trim() : '';
}

function resetClosedCopy(): void {
  hint.value = mode.value === 'daily' ? '看看今天，书想告诉你什么' : '在心里默念你的问题';
  resultStatus.value = mode.value === 'daily' ? '今日答案尚未揭晓' : '尚未揭晓';
}

function randomId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStorage<T>(key: string, fallback: T): T {
  if (!storageEnabled.value) return fallback;
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    storageEnabled.value = false;
    return fallback;
  }
}

function writeStorage(key: string, value: unknown): void {
  if (!storageEnabled.value) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    storageEnabled.value = false;
    showNotice('本地记录暂时不可用，答案仍可正常翻阅。');
  }
}

function normalizeHistory(value: unknown): HistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const answerText =
      typeof record.answerText === 'string'
        ? record.answerText
        : typeof record.answer === 'string'
          ? record.answer
          : '';
    if (!answerText || !isThemeId(record.theme) || !isAnswerMode(record.mode)) return [];
    return [
      {
        id: typeof record.id === 'string' ? record.id : randomId(),
        question: typeof record.question === 'string' ? record.question : '',
        answerId: typeof record.answerId === 'string' ? record.answerId : '',
        answerText,
        theme: record.theme,
        mode: record.mode,
        createdAt:
          typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
      },
    ];
  });
}

function normalizeRecent(value: unknown): RecentItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    return isThemeId(record.theme) && typeof record.answerId === 'string'
      ? [{ theme: record.theme, answerId: record.answerId }]
      : [];
  });
}

function showNotice(text: string): void {
  notice.value = text;
  if (noticeTimer !== null) window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    notice.value = '';
    noticeTimer = null;
  }, 2600);
}

function hash(text: string): number {
  let value = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value += (value << 1) + (value << 4) + (value << 7) + (value << 8) + (value << 24);
  }
  return value >>> 0;
}

function todayKey(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function getUserId(): string {
  let id = readStorage(keys.user, '');
  if (!id) {
    id = randomId();
    writeStorage(keys.user, id);
  }
  return id;
}

function getAnswer(): Answer | null {
  const list = answers[theme.value];
  if (!list.length) {
    showNotice('答案之书暂时没有可翻阅的内容。');
    return null;
  }
  if (mode.value === 'daily') {
    return list[hash(`${todayKey()}:${getUserId()}:${theme.value}`) % list.length];
  }

  const recentIds = recent.value
    .filter((item) => item.theme === theme.value)
    .slice(0, 5)
    .map((item) => item.answerId);
  const candidates = list.filter((item) => !recentIds.includes(item.id));
  const source = candidates.length ? candidates : list;
  return source[Math.floor(Math.random() * source.length)];
}

function isReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function waitForMotion(element: HTMLElement | null, timeout: number, callback: () => void): void {
  const token = ++motionToken;
  if (!element || isReducedMotion()) {
    callback();
    return;
  }

  let timer = 0;
  let finished = false;
  const cleanup = (): void => {
    element.removeEventListener('transitionend', finish);
    window.clearTimeout(timer);
    motionCleanups.delete(cleanup);
  };
  const finish = (event?: TransitionEvent): void => {
    if (event && (event.target !== element || event.propertyName !== 'transform')) return;
    if (finished || token !== motionToken) return;
    finished = true;
    cleanup();
    callback();
  };
  element.addEventListener('transitionend', finish);
  timer = window.setTimeout(() => finish(), timeout);
  motionCleanups.add(cleanup);
}

function saveHistory(selected: Answer, selectedQuestion: string, date: Date): void {
  history.value = [
    {
      id: randomId(),
      question: selectedQuestion,
      answerId: selected.id,
      answerText: selected.text,
      theme: selected.theme,
      mode: mode.value,
      createdAt: date.toISOString(),
    },
    ...history.value,
  ].slice(0, 50);
  recent.value = [{ theme: selected.theme, answerId: selected.id }, ...recent.value].slice(0, 15);
  writeStorage(keys.history, history.value);
  writeStorage(keys.recent, recent.value);
}

function commitAnswer(selected: Answer, selectedQuestion: string, date: Date): void {
  answer.value = selected;
  answeredQuestion.value = selectedQuestion;
  answeredAt.value = date;
  turningAnswer.value = null;
  pageResetting.value = false;
  phase.value = 'open';
  hint.value = '';
  resultStatus.value = mode.value === 'daily' ? '今日答案已揭晓' : '答案已揭晓';
  saveHistory(selected, selectedQuestion, date);
}

function openBook(): void {
  if (phase.value !== 'closed') return;
  const selected = getAnswer();
  if (!selected) return;
  const selectedQuestion = currentQuestion();
  const date = new Date();
  answer.value = selected;
  phase.value = 'opening';
  hint.value = mode.value === 'daily' ? '今日的答案已为你留在这一页' : '让书页慢慢展开';
  resultStatus.value = '正在翻页';
  waitForMotion(turningPageRef.value, 1250, () => commitAnswer(selected, selectedQuestion, date));
}

async function turnPage(): Promise<void> {
  if (phase.value !== 'open' || !answer.value || mode.value === 'daily') return;
  const selected = getAnswer();
  if (!selected) return;
  const selectedQuestion = currentQuestion();
  const date = new Date();
  turningAnswer.value = answer.value;
  phase.value = 'turning';
  pageResetting.value = true;
  hint.value = '下一页正在回答你';
  resultStatus.value = '正在翻页';
  await nextTick();
  if (bookRef.value) void bookRef.value.offsetWidth;
  answer.value = selected;
  pageResetting.value = false;
  waitForMotion(turningPageRef.value, 950, () => commitAnswer(selected, selectedQuestion, date));
}

function closeBook(afterClose?: () => void): void {
  if (phase.value === 'closed') {
    afterClose?.();
    return;
  }
  if (phase.value !== 'open') return;
  phase.value = 'closing';
  hint.value = '把这一页轻轻收好';
  resultStatus.value = '正在合书';
  waitForMotion(coverRef.value, 1700, () => {
    phase.value = 'closed';
    answer.value = null;
    turningAnswer.value = null;
    answeredQuestion.value = '';
    answeredAt.value = null;
    resetClosedCopy();
    afterClose?.();
  });
}

function requestAnswer(): void {
  if (phase.value === 'closed') openBook();
  else if (phase.value === 'open' && mode.value === 'random') void turnPage();
}

function setTheme(id: ThemeId): void {
  if (busy.value || id === theme.value) return;
  if (phase.value === 'open')
    closeBook(() => {
      theme.value = id;
      resetClosedCopy();
    });
  else theme.value = id;
}

function setMode(value: AnswerMode): void {
  if (busy.value || value === mode.value) return;
  const applyMode = (): void => {
    mode.value = value;
    resetClosedCopy();
  };
  if (phase.value === 'open') closeBook(applyMode);
  else applyMode();
}

function fallbackCopy(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showNotice('答案已复制');
  } catch {
    showNotice('暂时无法复制，请手动选择文字。');
  }
  textarea.remove();
}

async function copyAnswer(): Promise<void> {
  if (!answer.value) return;
  const text = `${answer.value.text}\n—— ${getTheme(answer.value.theme).name}答案之书`;
  try {
    await navigator.clipboard.writeText(text);
    showNotice('答案已复制');
  } catch {
    fallbackCopy(text);
  }
}

function formatDate(value: string | Date | null): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(
    date.getDate(),
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

function deleteHistory(id: string): void {
  history.value = history.value.filter((item) => item.id !== id);
  writeStorage(keys.history, history.value);
}

function clearHistory(): void {
  if (!history.value.length || !window.confirm('确定清空全部本地历史记录吗？此操作无法恢复。'))
    return;
  history.value = [];
  recent.value = [];
  writeStorage(keys.history, history.value);
  writeStorage(keys.recent, recent.value);
  showNotice('本地历史已清空');
}

function layerTarget(event?: Event): HTMLElement | null {
  return event?.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
}

function lockBody(): void {
  if (!historyVisible.value && !shareVisible.value)
    previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
}

function unlockBody(): void {
  if (!historyVisible.value && !shareVisible.value)
    document.body.style.overflow = previousBodyOverflow;
}

async function openHistory(event?: Event): Promise<void> {
  layerTrigger = layerTarget(event);
  lockBody();
  historyVisible.value = true;
  await nextTick();
  historyCloseRef.value?.focus();
}

function closeHistory(): void {
  historyVisible.value = false;
  unlockBody();
  layerTrigger?.focus();
  layerTrigger = null;
}

function canvasFont(size: number, family: string, weight = 400): string {
  return `${weight} ${size}px ${family}`;
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const characters = Array.from(text.replace(/\s+/g, ' ').trim());
  const noLineStart = '，。！？；：、）》」』】…';
  const lines: string[] = [];
  let line = '';
  for (const character of characters) {
    const candidate = line + character;
    if (
      !line ||
      context.measureText(candidate).width <= maxWidth ||
      noLineStart.includes(character)
    )
      line = candidate;
    else {
      lines.push(line);
      line = character;
    }
  }
  if (line) lines.push(line);
  if (!lines.length) return [''];
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines - 1);
  let last = lines.slice(maxLines - 1).join('');
  while (last.length > 1 && context.measureText(`${last}…`).width > maxWidth)
    last = last.slice(0, -1);
  visible.push(`${last.replace(/[，。；：、]+$/, '')}…`);
  return visible;
}

function getAnswerLayout(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): { fontSize: number; lines: string[] } {
  const family = '"Kaiti SC", STKaiti, KaiTi, serif';
  for (let size = 104; size >= 66; size -= 2) {
    context.font = canvasFont(size, family, 500);
    if (context.measureText(text).width <= maxWidth) return { fontSize: size, lines: [text] };
  }
  context.font = canvasFont(92, family, 500);
  return { fontSize: 92, lines: wrapCanvasText(context, text, maxWidth, 3) };
}

function drawPaperTexture(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.fillStyle = '#faf4e6';
  context.fillRect(0, 0, width, height);
  for (let index = 0; index < 260; index += 1) {
    const x = 38 + ((index * 137) % (width - 76));
    const y = 34 + ((index * 83) % (height - 68));
    context.fillStyle = `rgba(113, 91, 51, ${0.018 + (index % 5) * 0.006})`;
    context.fillRect(x, y, 1 + (index % 2), 1 + ((index + 1) % 2));
  }
  context.strokeStyle = 'rgba(64, 84, 55, .62)';
  context.lineWidth = 2;
  context.strokeRect(44, 44, width - 88, height - 88);
  context.strokeStyle = 'rgba(190, 151, 71, .5)';
  context.lineWidth = 1;
  context.strokeRect(57, 57, width - 114, height - 114);
}

function drawPostmark(context: CanvasRenderingContext2D): void {
  context.save();
  context.translate(1375, 144);
  context.rotate(-0.12);
  context.strokeStyle = 'rgba(76, 103, 70, .46)';
  context.fillStyle = 'rgba(76, 103, 70, .62)';
  context.lineWidth = 3;
  context.beginPath();
  context.arc(0, 0, 70, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(0, 0, 55, 0, Math.PI * 2);
  context.stroke();
  context.font = canvasFont(19, 'Arial, sans-serif', 700);
  context.textAlign = 'center';
  context.fillText('MEOWV', 0, -5);
  context.font = canvasFont(15, 'Arial, sans-serif');
  context.fillText('ANSWER BOOK', 0, 20);
  for (let index = 0; index < 4; index += 1) {
    context.beginPath();
    context.moveTo(-155, -24 + index * 17);
    context.lineTo(-78, -24 + index * 17);
    context.stroke();
  }
  context.restore();
}

function drawSprig(context: CanvasRenderingContext2D, left: number): void {
  context.save();
  context.translate(left, 0);
  context.strokeStyle = 'rgba(79, 112, 67, .5)';
  context.fillStyle = 'rgba(102, 132, 76, .18)';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(1.5, 936);
  context.bezierCurveTo(20, 914, 38, 882, 60, 846);
  context.stroke();
  for (const leaf of [
    [22, 916, -20],
    [33, 898, 20],
    [47, 876, -18],
    [59, 856, 18],
  ]) {
    context.save();
    context.translate(leaf[0], leaf[1]);
    context.rotate((leaf[2] * Math.PI) / 180);
    context.beginPath();
    context.ellipse(0, 0, 20, 9, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }
  context.restore();
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const value = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + value, y);
  context.lineTo(x + width - value, y);
  context.quadraticCurveTo(x + width, y, x + width, y + value);
  context.lineTo(x + width, y + height - value);
  context.quadraticCurveTo(x + width, y + height, x + width - value, y + height);
  context.lineTo(x + value, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - value);
  context.lineTo(x, y + value);
  context.quadraticCurveTo(x, y, x + value, y);
  context.closePath();
}

function drawShareCard(context: CanvasRenderingContext2D, qrCanvas: HTMLCanvasElement): void {
  if (!answer.value || !answeredAt.value || !shareCanvasRef.value) return;
  const canvas = shareCanvasRef.value;
  const width = canvas.width;
  const height = canvas.height;
  const answerTheme = getTheme(answer.value.theme);
  const showQuestion = Boolean(answeredQuestion.value && shareQuestion.value);
  const serif = '"Kaiti SC", STKaiti, KaiTi, serif';
  const sans = '"PingFang SC", "Microsoft YaHei", Arial, sans-serif';
  context.clearRect(0, 0, width, height);
  drawPaperTexture(context, width, height);
  drawPostmark(context);
  context.fillStyle = '#324633';
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.font = canvasFont(31, sans, 600);
  context.fillText('答案之书', 92, 124);
  context.fillStyle = '#9c8251';
  context.font = canvasFont(18, sans, 500);
  context.fillText('A NOTE FOR YOU', 94, 158);
  context.strokeStyle = 'rgba(154, 126, 72, .42)';
  context.beginPath();
  context.moveTo(92, 180);
  context.lineTo(520, 180);
  context.stroke();

  if (showQuestion) {
    context.fillStyle = '#8b7449';
    context.font = canvasFont(20, sans, 600);
    context.fillText('你写下的问题', 116, 226);
    context.fillStyle = '#5d6456';
    context.font = canvasFont(36, serif);
    wrapCanvasText(context, answeredQuestion.value, 1180, 2).forEach((line, index) =>
      context.fillText(line, 116, 274 + index * 48),
    );
  }

  const bookLeft = 176;
  const bookCenter = width / 2;
  const bookRight = width - bookLeft;
  const bookTop = showQuestion ? 344 : 228;
  const bookBottom = 820;
  const bookHeight = bookBottom - bookTop;
  const pageWidth = bookCenter - bookLeft;

  context.save();
  context.shadowColor = 'rgba(60, 48, 27, .24)';
  context.shadowBlur = 34;
  context.shadowOffsetY = 22;
  roundedRectPath(context, bookLeft, bookTop, bookRight - bookLeft, bookHeight, 20);
  context.fillStyle = '#dfd3bd';
  context.fill();
  context.restore();

  const leftPage = context.createLinearGradient(bookLeft, 0, bookCenter, 0);
  leftPage.addColorStop(0, '#e5dbc8');
  leftPage.addColorStop(0.035, '#fbf4e5');
  leftPage.addColorStop(0.9, '#fffaf0');
  leftPage.addColorStop(1, '#ddd1ba');
  roundedRectPath(context, bookLeft, bookTop, pageWidth, bookHeight, 18);
  context.fillStyle = leftPage;
  context.fill();
  context.strokeStyle = 'rgba(131, 105, 60, .28)';
  context.lineWidth = 2;
  context.stroke();

  const rightPage = context.createLinearGradient(bookCenter, 0, bookRight, 0);
  rightPage.addColorStop(0, '#ded2bc');
  rightPage.addColorStop(0.1, '#fffaf0');
  rightPage.addColorStop(0.965, '#fbf4e5');
  rightPage.addColorStop(1, '#dfd3bd');
  roundedRectPath(context, bookCenter, bookTop, pageWidth, bookHeight, 18);
  context.fillStyle = rightPage;
  context.fill();
  context.stroke();

  context.strokeStyle = 'rgba(162, 132, 73, .22)';
  context.lineWidth = 2;
  roundedRectPath(context, bookLeft + 22, bookTop + 22, pageWidth - 44, bookHeight - 44, 9);
  context.stroke();
  roundedRectPath(context, bookCenter + 22, bookTop + 22, pageWidth - 44, bookHeight - 44, 9);
  context.stroke();

  const gutter = context.createLinearGradient(bookCenter - 30, 0, bookCenter + 30, 0);
  gutter.addColorStop(0, 'rgba(77, 57, 31, 0)');
  gutter.addColorStop(0.38, 'rgba(77, 57, 31, .16)');
  gutter.addColorStop(0.5, 'rgba(62, 45, 24, .24)');
  gutter.addColorStop(0.62, 'rgba(255, 255, 255, .34)');
  gutter.addColorStop(1, 'rgba(77, 57, 31, 0)');
  context.fillStyle = gutter;
  context.fillRect(bookCenter - 30, bookTop + 3, 60, bookHeight - 6);

  for (let index = 0; index < 3; index += 1) {
    context.strokeStyle = `rgba(126, 98, 53, ${0.18 - index * 0.04})`;
    context.beginPath();
    context.moveTo(bookRight + index * 4, bookTop + 18 + index * 3);
    context.lineTo(bookRight + index * 4, bookBottom - 16 - index * 2);
    context.stroke();
  }

  context.fillStyle = 'rgba(96, 84, 60, .62)';
  context.textAlign = 'center';
  context.font = canvasFont(showQuestion ? 34 : 40, serif, 400);
  context.fillText('所有答案，', bookLeft + pageWidth / 2, bookTop + bookHeight / 2 - 10);
  context.fillText('都只是另一种提醒。', bookLeft + pageWidth / 2, bookTop + bookHeight / 2 + 48);

  context.strokeStyle = 'rgba(169, 132, 61, .42)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(bookLeft + pageWidth / 2 - 70, bookTop + bookHeight / 2 - 82);
  context.lineTo(bookLeft + pageWidth / 2 + 70, bookTop + bookHeight / 2 - 82);
  context.stroke();

  const layout = getAnswerLayout(context, answer.value.text, pageWidth - 150);
  const lineHeight = layout.fontSize * 1.3;
  const centerY = bookTop + bookHeight / 2;
  const firstBaseline =
    centerY - ((layout.lines.length - 1) * lineHeight) / 2 + layout.fontSize * 0.34;
  context.font = canvasFont(layout.fontSize, serif, 500);
  context.fillStyle = '#263d2e';
  context.textAlign = 'center';
  layout.lines.forEach((line, index) =>
    context.fillText(line, bookCenter + pageWidth / 2, firstBaseline + index * lineHeight),
  );
  context.fillStyle = '#898c7b';
  context.font = canvasFont(20, sans, 500);
  context.fillText(
    `—— ${answerTheme.name}答案之书`,
    bookCenter + pageWidth / 2,
    Math.min(bookBottom - 58, firstBaseline + layout.lines.length * lineHeight + 34),
  );

  const footerInset = 92;
  drawSprig(context, footerInset);
  context.fillStyle = '#697160';
  context.font = canvasFont(23, sans, 500);
  context.textAlign = 'left';
  context.fillText(
    `${answerTheme.name}答案之书 · ${mode.value === 'daily' ? '今日答案' : '随心一问'}`,
    bookLeft,
    878,
  );
  context.fillStyle = '#9a8c71';
  context.font = canvasFont(19, sans);
  context.fillText(formatDate(answeredAt.value), bookLeft, 912);
  const qrSize = 96;
  const qrRight = width - footerInset;
  context.drawImage(qrCanvas, qrRight - qrSize, 842, qrSize, qrSize);
}

function releaseShareDownload(): void {
  if (shareDownloadObjectUrl.value && shareDownloadUrl.value)
    URL.revokeObjectURL(shareDownloadUrl.value);
  shareDownloadUrl.value = '';
  shareDownloadObjectUrl.value = false;
  shareReady.value = false;
}

function createShareDownload(
  canvas: HTMLCanvasElement,
): Promise<{ url: string; objectUrl: boolean }> {
  if (typeof canvas.toBlob !== 'function')
    return Promise.resolve({ url: canvas.toDataURL('image/png'), objectUrl: false });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve({ url: URL.createObjectURL(blob), objectUrl: true });
      else reject(new Error('PNG 编码失败，请重试。'));
    }, 'image/png');
  });
}

async function renderShareCard(): Promise<void> {
  const token = ++shareRenderToken;
  releaseShareDownload();
  shareNotice.value = '正在制作你的答案明信片…';
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const qrCanvas = document.createElement('canvas');
    await QRCode.toCanvas(qrCanvas, SHARE_URL, {
      width: 172,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#263d2e', light: '#00000000' },
    });
    if (token !== shareRenderToken || !answer.value || !shareCanvasRef.value) return;
    const context = shareCanvasRef.value.getContext('2d');
    if (!context) throw new Error('当前浏览器无法生成分享图片');
    drawShareCard(context, qrCanvas);
    const download = await createShareDownload(shareCanvasRef.value);
    if (token !== shareRenderToken || !answer.value) {
      if (download.objectUrl) URL.revokeObjectURL(download.url);
      return;
    }
    shareDownloadUrl.value = download.url;
    shareDownloadObjectUrl.value = download.objectUrl;
    shareReady.value = true;
    shareNotice.value = '图片已就绪，问题和答案只在你的浏览器中生成。';
  } catch (error) {
    if (token !== shareRenderToken) return;
    shareNotice.value = error instanceof Error ? error.message : '分享卡片生成失败，请重试。';
  }
}

async function openShare(event?: Event): Promise<void> {
  if (phase.value !== 'open' || !answer.value) return;
  layerTrigger = layerTarget(event);
  shareQuestion.value = Boolean(answeredQuestion.value);
  lockBody();
  shareVisible.value = true;
  await nextTick();
  shareCloseRef.value?.focus();
  await renderShareCard();
}

function closeShare(): void {
  shareVisible.value = false;
  unlockBody();
  layerTrigger?.focus();
  layerTrigger = null;
}

function toggleShareQuestion(): void {
  shareQuestion.value = !shareQuestion.value;
  void renderShareCard();
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  if (shareVisible.value) closeShare();
  else if (historyVisible.value) closeHistory();
}

onMounted(() => {
  storageEnabled.value = storageAvailable();
  history.value = normalizeHistory(readStorage<unknown>(keys.history, []));
  recent.value = normalizeRecent(readStorage<unknown>(keys.recent, []));
  document.addEventListener('keydown', handleEscape);
});

onBeforeUnmount(() => {
  motionToken += 1;
  shareRenderToken += 1;
  for (const cleanup of motionCleanups) cleanup();
  if (noticeTimer !== null) window.clearTimeout(noticeTimer);
  releaseShareDownload();
  document.removeEventListener('keydown', handleEscape);
  document.body.style.overflow = previousBodyOverflow;
});
</script>

<template>
  <div class="answer-book-workspace" :class="`is-${mode}-mode`">
    <div class="answer-book-grid">
      <section class="answer-book-panel" aria-labelledby="answer-book-settings-title">
        <header class="answer-book-panel__head">
          <h2 id="answer-book-settings-title">提问设置</h2>
          <button type="button" class="answer-book-history-button" @click="openHistory">
            <IconHistory :size="15" aria-hidden="true" />翻阅记录
          </button>
        </header>
        <div class="answer-book-panel__body">
          <label class="answer-book-label">回答方式</label>
          <div class="answer-book-mode" role="tablist" aria-label="回答模式">
            <button
              type="button"
              role="tab"
              :class="{ 'is-active': mode === 'random' }"
              :aria-selected="mode === 'random'"
              :disabled="busy"
              @click="setMode('random')"
            >
              随心一问
            </button>
            <button
              type="button"
              role="tab"
              :class="{ 'is-active': mode === 'daily' }"
              :aria-selected="mode === 'daily'"
              :disabled="busy"
              @click="setMode('daily')"
            >
              今日答案
            </button>
          </div>

          <Transition name="answer-book-mode-panel" mode="out-in">
            <div v-if="mode === 'random'" key="random" class="answer-book-question-field">
              <label class="answer-book-label" for="answer-book-question"
                >想问的问题 <small>可选</small></label
              >
              <textarea
                id="answer-book-question"
                v-model="question"
                maxlength="200"
                placeholder="写下你的问题，也可以只放在心里"
              ></textarea>
            </div>
            <div v-else key="daily" class="answer-book-daily-intro">
              <small>TODAY'S NOTE</small>
              <strong>今天的答案</strong>
              <span>看看今天，书想告诉你什么。</span>
              <p>同一主题每天只会得到一句属于你的答案。</p>
            </div>
          </Transition>

          <label class="answer-book-label">
            答案主题
            <small v-if="mode === 'daily'">· 选择今天想听的方向</small>
          </label>
          <div class="answer-book-themes" aria-label="答案主题">
            <button
              v-for="item in themes"
              :key="item.id"
              type="button"
              :class="{ 'is-active': theme === item.id }"
              :aria-pressed="theme === item.id"
              :disabled="busy"
              @click="setTheme(item.id)"
            >
              {{ item.name }}
            </button>
          </div>

          <div v-if="phase !== 'open'" class="answer-book-toolbar">
            <button
              type="button"
              class="tool-button tool-button--primary answer-book-primary"
              :disabled="busy"
              @click="requestAnswer"
            >
              <IconBook2 :size="17" aria-hidden="true" />{{ primaryLabel }}
            </button>
          </div>
        </div>
      </section>

      <section class="answer-book-panel" aria-labelledby="answer-book-result-title">
        <h2 id="answer-book-result-title" class="visually-hidden">答案揭晓区</h2>
        <div class="answer-book-stage">
          <span class="answer-book-status">{{ resultStatus }}</span>
          <div
            ref="bookRef"
            class="answer-book"
            :class="bookClasses"
            :role="phase === 'open' && mode === 'daily' ? undefined : 'button'"
            :tabindex="phase === 'open' && mode === 'daily' ? -1 : 0"
            :aria-label="
              phase === 'open'
                ? mode === 'daily'
                  ? '今日答案已揭晓'
                  : '翻动书页，获取另一个答案'
                : primaryLabel
            "
            :aria-busy="busy"
            @click="requestAnswer"
            @keydown.enter.prevent="requestAnswer"
            @keydown.space.prevent="requestAnswer"
          >
            <div class="answer-book__leaf answer-book__left-page" aria-hidden="true">
              <span>所有答案，<br />都只是另一种提醒。</span>
            </div>
            <div class="answer-book__leaf answer-book__right-page">
              <div class="answer-book__answer">
                <p :class="`answer-book__text--${answerTextSize(answer?.text)}`">
                  {{ answer?.text }}
                </p>
                <small v-if="answer">—— {{ getTheme(answer.theme).name }}答案之书</small>
              </div>
            </div>
            <div ref="turningPageRef" class="answer-book__turning-page" aria-hidden="true">
              <div class="answer-book__page-face answer-book__page-front">
                <span class="answer-book__whisper">轻轻翻开这一页</span>
                <div class="answer-book__turning-answer">
                  <p :class="`answer-book__text--${answerTextSize(turningAnswer?.text)}`">
                    {{ turningAnswer?.text }}
                  </p>
                  <small v-if="turningAnswer"
                    >—— {{ getTheme(turningAnswer.theme).name }}答案之书</small
                  >
                </div>
              </div>
              <div class="answer-book__page-face answer-book__page-back"></div>
            </div>
            <div ref="coverRef" class="answer-book__cover">
              <div class="answer-book__cover-face answer-book__cover-front">
                <small>{{
                  mode === 'daily' ? '今天只属于你的一句话' : activeTheme.subtitle
                }}</small>
                <strong>答案之书</strong>
                <span>{{ activeTheme.name }}</span>
              </div>
              <div class="answer-book__cover-face answer-book__cover-back">
                <span>所有答案，<br />都只是另一种提醒。</span>
              </div>
            </div>
            <span class="answer-book__spine" aria-hidden="true"></span>
          </div>
          <p v-if="hint" class="answer-book-hint">{{ hint }}</p>
          <p v-if="phase === 'closed'" class="answer-book-guidance">
            {{ mode === 'daily' ? '今天的答案已经在等你。' : '当你准备好时，翻开答案之书。' }}
          </p>
        </div>

        <div v-if="phase === 'open'" class="answer-book-actions">
          <button
            v-if="mode === 'random'"
            type="button"
            class="answer-book-actions__primary"
            @click="turnPage"
          >
            <IconRefresh :size="15" aria-hidden="true" />再问一次
          </button>
          <button type="button" @click="copyAnswer">
            <IconCopy :size="15" aria-hidden="true" />复制答案
          </button>
          <button type="button" @click="openShare">
            <IconShare3 :size="15" aria-hidden="true" />分享卡片
          </button>
          <button type="button" @click="closeBook()">
            <IconBook :size="15" aria-hidden="true" />合上书
          </button>
        </div>
        <p class="answer-book-notice" aria-live="polite">{{ notice }}</p>
      </section>
    </div>

    <Teleport to="body">
      <div
        v-if="historyVisible"
        class="answer-book-layer"
        role="presentation"
        @click.self="closeHistory"
      >
        <section
          class="answer-book-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="本地历史记录"
        >
          <header>
            <h2>本地历史</h2>
            <button ref="historyCloseRef" type="button" aria-label="关闭" @click="closeHistory">
              <IconX :size="20" aria-hidden="true" />
            </button>
          </header>
          <div class="answer-book-history">
            <p v-if="!history.length" class="answer-book-history__empty">还没有翻阅记录。</p>
            <article v-for="item in history" v-else :key="item.id">
              <p>{{ item.question || '藏在心里的问题' }}</p>
              <strong>“{{ item.answerText }}”</strong>
              <small>
                {{ getTheme(item.theme).name }} ·
                {{ item.mode === 'daily' ? '今日答案' : '随心一问' }} ·
                {{ formatDate(item.createdAt) }}
              </small>
              <button type="button" aria-label="删除记录" @click="deleteHistory(item.id)">
                <IconTrash :size="16" aria-hidden="true" />
              </button>
            </article>
          </div>
          <button
            type="button"
            class="tool-button tool-button--danger answer-book-dialog__danger"
            :disabled="!history.length"
            @click="clearHistory"
          >
            清空全部记录
          </button>
        </section>
      </div>

      <div
        v-if="shareVisible"
        class="answer-book-layer answer-book-layer--center"
        role="presentation"
        @click.self="closeShare"
      >
        <section
          class="answer-book-dialog answer-book-share"
          role="dialog"
          aria-modal="true"
          aria-labelledby="answer-book-share-title"
        >
          <header>
            <h2 id="answer-book-share-title">答案明信片</h2>
            <button ref="shareCloseRef" type="button" aria-label="关闭" @click="closeShare">
              <IconX :size="20" aria-hidden="true" />
            </button>
          </header>
          <div class="answer-book-share__preview">
            <canvas
              ref="shareCanvasRef"
              width="1600"
              height="1000"
              role="img"
              :aria-label="`答案明信片${answer ? `，答案：${answer.text}` : ''}${
                answeredQuestion && shareQuestion ? `，问题：${answeredQuestion}` : ''
              }`"
            ></canvas>
          </div>
          <div class="answer-book-share__controls">
            <div v-if="answeredQuestion" class="answer-book-share__question">
              <span>在卡片中显示问题</span>
              <button
                type="button"
                role="switch"
                :aria-checked="shareQuestion"
                :class="{ 'is-active': shareQuestion }"
                aria-label="在卡片中显示问题"
                @click="toggleShareQuestion"
              ></button>
            </div>
            <a
              class="answer-book-share__download"
              :class="{ 'is-disabled': !shareReady }"
              :href="shareReady ? shareDownloadUrl : undefined"
              :download="`答案之书-${todayKey().replace(/-/g, '')}.png`"
              :aria-disabled="!shareReady"
            >
              <IconDownload :size="17" aria-hidden="true" />下载 PNG
            </a>
          </div>
          <p class="answer-book-share__notice" aria-live="polite">{{ shareNotice }}</p>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.answer-book-workspace {
  color: var(--color-text);
  container-type: inline-size;
}
.answer-book-grid {
  display: grid;
  grid-template-columns: minmax(248px, 28%) minmax(0, 1fr);
  gap: 16px;
}
.answer-book-panel {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface-solid);
  box-shadow: 0 2px 8px rgb(49 69 39 / 4%);
}
.answer-book-panel__head,
.answer-book-toolbar,
.answer-book-actions,
.answer-book-dialog > header,
.answer-book-share__controls,
.answer-book-share__question {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.answer-book-panel__head {
  min-height: 52px;
  padding: 0 15px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-soft);
}
.answer-book-panel__head h2 {
  margin: 0;
  font-size: 12px;
}
.answer-book-panel__head span {
  display: inline-flex;
  min-height: 24px;
  padding: 0 8px;
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--tools-accent) 24%, var(--color-border));
  border-radius: 13px;
  color: var(--tools-accent);
  background: color-mix(in srgb, var(--tools-accent) 7%, var(--color-surface-solid));
  font-size: 9px;
  white-space: nowrap;
}
.answer-book-history-button {
  display: inline-flex;
  min-height: 30px;
  padding: 0 4px;
  align-items: center;
  gap: 5px;
  border: 0;
  color: var(--color-text-muted);
  background: transparent;
  font: inherit;
  font-size: 9px;
  cursor: pointer;
  transition:
    color 0.2s ease,
    transform 0.2s ease;
}
.answer-book-history-button:hover {
  color: var(--tools-accent);
  transform: translateY(-1px);
}
.answer-book-history-button:active {
  transform: translateY(0) scale(0.97);
}
.answer-book-panel__body {
  padding: 16px;
}
.answer-book-label {
  display: block;
  margin-bottom: 8px;
  color: var(--color-text);
  font-size: 10px;
  font-weight: 700;
}
.answer-book-label small {
  color: var(--color-text-muted);
  font-weight: 400;
}
.answer-book-mode {
  display: flex;
  width: 100%;
  margin-bottom: 17px;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface-soft);
  box-sizing: border-box;
}
.answer-book-mode button,
.answer-book-themes button,
.answer-book-actions button,
.answer-book-dialog header button,
.answer-book-history article button,
.answer-book-share__question button {
  border: 0;
  font: inherit;
  cursor: pointer;
}
.answer-book-mode button {
  min-height: 36px;
  flex: 1;
  border-radius: 6px;
  color: var(--color-text-muted);
  background: transparent;
  font-size: 10px;
  transition:
    color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}
.answer-book-mode button:active:not(:disabled) {
  transform: scale(0.98);
}
.is-daily-mode .answer-book-mode button.is-active {
  background: #3f6341;
  box-shadow: 0 2px 7px rgb(48 79 51 / 25%);
}
.answer-book-mode button.is-active {
  color: #fff;
  background: var(--tools-accent);
  box-shadow: 0 2px 5px color-mix(in srgb, var(--tools-accent) 24%, transparent);
}
.answer-book-mode button:disabled,
.answer-book-themes button:disabled {
  opacity: 0.58;
  cursor: wait;
}
.answer-book-panel textarea {
  width: 100%;
  min-height: 76px;
  margin: 0 0 17px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  outline: none;
  color: var(--color-text);
  background: var(--color-surface-soft);
  box-sizing: border-box;
  font: inherit;
  font-size: 10px;
  line-height: 1.55;
  resize: vertical;
}
.answer-book-panel textarea:focus {
  border-color: var(--tools-accent);
  background: var(--color-surface-solid);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tools-accent) 10%, transparent);
}
.answer-book-question-field {
  min-height: 111px;
}
.answer-book-daily-intro {
  display: flex;
  min-height: 111px;
  margin-bottom: 17px;
  padding: 14px 15px;
  justify-content: center;
  flex-direction: column;
  border: 1px solid rgb(76 105 66 / 22%);
  border-radius: 9px;
  color: #46553f;
  background:
    radial-gradient(circle at 92% 12%, rgb(192 154 72 / 16%), transparent 30%),
    linear-gradient(135deg, #f8f5e9, #f1eddf);
  box-sizing: border-box;
}
.answer-book-daily-intro small {
  color: #a27e37;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.16em;
}
.answer-book-daily-intro strong {
  margin-top: 5px;
  font-family: 'Kaiti SC', STKaiti, KaiTi, serif;
  font-size: 17px;
  font-weight: 500;
  letter-spacing: 0.08em;
}
.answer-book-daily-intro span {
  margin-top: 4px;
  font-size: 10px;
}
.answer-book-daily-intro p {
  margin: 6px 0 0;
  color: #858173;
  font-size: 8px;
  line-height: 1.5;
}
.answer-book-mode-panel-enter-active,
.answer-book-mode-panel-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.answer-book-mode-panel-enter-from,
.answer-book-mode-panel-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
.answer-book-themes {
  display: grid;
  margin-bottom: 17px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}
.answer-book-themes button {
  position: relative;
  min-height: 33px;
  padding: 0 6px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-muted);
  background: var(--color-surface-solid);
  font-size: 9px;
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}
.answer-book-themes button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--tools-accent) 38%, var(--color-border));
  color: var(--tools-accent);
  transform: translateY(-1px);
}
.answer-book-themes button:active:not(:disabled) {
  transform: translateY(0) scale(0.97);
}
.answer-book-themes button.is-active {
  border-color: color-mix(in srgb, var(--tools-accent) 54%, var(--color-border));
  color: var(--tools-accent);
  background: color-mix(in srgb, var(--tools-accent) 9%, var(--color-surface-solid));
  box-shadow: inset 0 -3px var(--tools-accent);
}
.answer-book-themes button.is-active::after {
  position: absolute;
  bottom: -6px;
  left: 50%;
  width: 0;
  height: 0;
  border-top: 6px solid var(--tools-accent);
  border-right: 5px solid transparent;
  border-left: 5px solid transparent;
  content: '';
  transform: translateX(-50%);
}
.is-daily-mode .answer-book-themes button.is-active {
  border-color: rgb(63 99 65 / 54%);
  color: #3f6341;
  background: rgb(63 99 65 / 9%);
  box-shadow: inset 0 -3px #3f6341;
}
.is-daily-mode .answer-book-themes button.is-active::after {
  border-top-color: #3f6341;
}
.answer-book-toolbar {
  padding-top: 15px;
  border-top: 1px solid var(--color-border);
}
.answer-book-primary {
  min-width: 0;
  min-height: 50px;
  flex: 1;
  border-radius: 9px;
  box-shadow: 0 7px 16px color-mix(in srgb, var(--tools-accent) 22%, transparent);
  transition:
    box-shadow 0.2s ease,
    transform 0.2s ease;
}
.answer-book-primary:hover:not(:disabled) {
  box-shadow: 0 10px 21px color-mix(in srgb, var(--tools-accent) 28%, transparent);
  transform: translateY(-1px);
}
.answer-book-primary:active:not(:disabled) {
  transform: scale(0.97);
}
.answer-book-stage {
  position: relative;
  display: grid;
  min-height: 458px;
  padding: 44px 16px 24px;
  overflow: hidden;
  place-items: center;
  border-bottom: 1px solid var(--color-border);
  background:
    radial-gradient(circle at 50% 34%, rgb(255 253 247 / 94%), transparent 58%),
    linear-gradient(145deg, #f8f6ef, #f3eee3 72%, #eee6d7);
}
.is-daily-mode .answer-book-stage {
  background:
    radial-gradient(circle at 50% 32%, rgb(255 251 231 / 96%), transparent 57%),
    radial-gradient(circle at 80% 12%, rgb(190 148 58 / 12%), transparent 34%),
    linear-gradient(145deg, #f8f5ea, #f0eadb 72%, #e9dfcc);
}
.answer-book-stage::before {
  position: absolute;
  inset: 0;
  opacity: 0.18;
  background-image: repeating-linear-gradient(
    0deg,
    transparent 0,
    transparent 3px,
    color-mix(in srgb, var(--color-text-muted) 11%, transparent) 4px
  );
  content: '';
  pointer-events: none;
}
.answer-book-status {
  position: absolute;
  z-index: 2;
  top: 16px;
  right: 18px;
  color: color-mix(in srgb, var(--color-text-muted) 76%, transparent);
  font-size: 9px;
  letter-spacing: 0.08em;
}
.answer-book {
  position: relative;
  z-index: 1;
  width: min(96%, 840px);
  aspect-ratio: 2.385 / 1;
  outline: none;
  perspective: 1800px;
  cursor: pointer;
  transform: translateX(-25%);
  transform-style: preserve-3d;
  transition: transform 1.1s cubic-bezier(0.2, 0.72, 0.21, 1);
}
.answer-book:not(.is-opening, .is-open, .is-turning, .is-closing):hover .answer-book__cover {
  transform: translateY(-5px);
}
.answer-book:not(.is-opening, .is-open, .is-turning, .is-closing):hover .answer-book__cover-front {
  filter: saturate(1.04) brightness(1.03);
  box-shadow:
    10px 19px 28px rgb(43 59 40 / 34%),
    inset 4px 0 rgb(255 255 255 / 12%),
    inset -6px 0 rgb(0 0 0 / 12%);
}
.answer-book:not(.is-opening, .is-open, .is-turning, .is-closing):active .answer-book__cover {
  transform: translateY(-1px) scale(0.99);
}
.answer-book:focus-visible {
  border-radius: 8px;
  outline: 3px solid color-mix(in srgb, var(--tools-accent) 32%, transparent);
  outline-offset: 8px;
}
.answer-book__leaf,
.answer-book__turning-page,
.answer-book__cover {
  position: absolute;
  top: 0;
  width: 50%;
  height: 100%;
}
.answer-book__leaf {
  overflow: hidden;
  border: 1px solid #e1d8c6;
  background:
    radial-gradient(circle at 24% 18%, rgb(141 112 67 / 3%) 0 1px, transparent 1.5px),
    radial-gradient(circle at 70% 64%, rgb(141 112 67 / 2.6%) 0 1px, transparent 1.5px),
    linear-gradient(90deg, #e7dfcf, #fffdf6 7%, #fffef9 94%, #e8e0d1);
  background-size:
    17px 19px,
    23px 21px,
    auto;
  box-shadow: 0 20px 32px rgb(62 57 40 / 17%);
}
.answer-book__left-page {
  left: 0;
  opacity: 0;
  border-radius: 12px 3px 3px 12px;
  background:
    radial-gradient(circle at 76% 22%, rgb(141 112 67 / 3%) 0 1px, transparent 1.5px),
    linear-gradient(270deg, #ded5c4, #fffdf6 8%, #fffef9 94%, #e9e1d3);
  background-size:
    19px 21px,
    auto;
  transform: scaleX(0.28);
  transform-origin: right center;
  transition:
    opacity 0.3s ease,
    transform 0.72s cubic-bezier(0.2, 0.72, 0.21, 1);
}
.answer-book__left-page > span {
  position: absolute;
  inset: 38px 28px;
  display: grid;
  place-items: center;
  border: 1px solid rgb(157 130 70 / 20%);
  color: rgb(112 96 64 / 48%);
  font-family: 'Kaiti SC', STKaiti, KaiTi, serif;
  font-size: 15px;
  line-height: 2;
  letter-spacing: 0.18em;
  text-align: center;
}
.answer-book__right-page {
  right: 0;
  border-radius: 3px 12px 12px 3px;
  box-shadow:
    3px 2px 0 #eee5d4,
    6px 4px 0 #e5dbc8,
    9px 7px 18px rgb(62 57 40 / 12%);
}
.answer-book__leaf::after,
.answer-book__page-face::after {
  position: absolute;
  inset: 9px;
  border: 1px solid rgb(150 128 74 / 15%);
  content: '';
  pointer-events: none;
}
.answer-book__left-page::before,
.answer-book__right-page::before {
  position: absolute;
  z-index: 2;
  top: 0;
  bottom: 0;
  width: 22px;
  content: '';
  pointer-events: none;
}
.answer-book__left-page::before {
  right: 0;
  background: linear-gradient(90deg, transparent, rgb(72 59 34 / 16%));
}
.answer-book__right-page::before {
  left: 0;
  width: 32px;
  background: linear-gradient(
    90deg,
    rgb(63 49 28 / 22%),
    rgb(84 66 37 / 12%) 32%,
    rgb(255 255 255 / 28%) 54%,
    transparent
  );
}
.answer-book__turning-page,
.answer-book__cover {
  left: 50%;
  transform-origin: left center;
  transform-style: preserve-3d;
}
.answer-book__turning-page {
  z-index: 4;
  transform: rotateY(0);
  transition: transform 0.68s cubic-bezier(0.18, 0.71, 0.18, 1) 0.26s;
}
.answer-book__page-face,
.answer-book__cover-face {
  position: absolute;
  inset: 0;
  overflow: hidden;
  backface-visibility: hidden;
}
.answer-book__page-face {
  border: 1px solid #e0d7c5;
  background: linear-gradient(90deg, #e7dfcf, #fffdf7 8%, #fffefb 93%, #e5ddcd);
}
.answer-book__page-front {
  border-radius: 3px 11px 11px 3px;
  box-shadow: 9px 12px 18px rgb(69 59 38 / 15%);
}
.answer-book__page-back {
  border-radius: 11px 3px 3px 11px;
  background: linear-gradient(270deg, #e6dece, #fffdf7 8%, #fffefb 94%, #e7dfcf);
  transform: rotateY(180deg);
}
.answer-book__whisper {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 50%;
  color: rgb(100 85 54 / 48%);
  font-family: 'Kaiti SC', STKaiti, KaiTi, serif;
  font-size: 10px;
  letter-spacing: 2px;
  white-space: nowrap;
  transform: translate(-50%, -50%);
}
.answer-book__answer,
.answer-book__turning-answer {
  position: absolute;
  z-index: 3;
  inset: 26px 22px;
  display: flex;
  opacity: 0;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: #48533e;
  text-align: center;
}
.answer-book__answer {
  transform: translateY(4px) scale(0.985);
  transition:
    opacity 0.45s ease,
    transform 0.45s ease;
}
.answer-book__answer p,
.answer-book__turning-answer p {
  max-width: 100%;
  margin: 0;
  font-family: 'Kaiti SC', STKaiti, KaiTi, Georgia, serif;
  line-height: 1.7;
  letter-spacing: 0.08em;
}
.answer-book__text--short {
  font-size: clamp(30px, 2.2vw, 42px);
}
.answer-book__text--medium {
  font-size: clamp(28px, 2vw, 36px);
}
.answer-book__text--long {
  font-size: clamp(25px, 1.8vw, 32px);
}
.answer-book__answer small,
.answer-book__turning-answer small {
  margin-top: 20px;
  color: #8a8f7b;
  font-size: 9px;
}
.answer-book__cover {
  z-index: 5;
  transform: rotateY(0);
  transition: transform 0.8s cubic-bezier(0.18, 0.72, 0.18, 1);
}
.answer-book__cover-front {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  border: 1px solid #29412b;
  border-radius: 5px 12px 12px 5px;
  color: #e5c46b;
  background: linear-gradient(115deg, #2c4c30, #4d7345 55%, #385a38);
  box-shadow:
    7px 13px 20px rgb(43 59 40 / 30%),
    inset 4px 0 rgb(255 255 255 / 10%),
    inset -6px 0 rgb(0 0 0 / 12%);
  transition:
    box-shadow 0.25s ease,
    filter 0.25s ease;
}
.answer-book__cover-front::before {
  position: absolute;
  inset: 13px;
  border: 1px solid rgb(229 196 107 / 66%);
  border-radius: 2px 8px 8px 2px;
  content: '';
}
.answer-book__cover-front small,
.answer-book__cover-front strong,
.answer-book__cover-front span {
  z-index: 1;
}
.answer-book__cover-front small {
  margin-bottom: 13px;
  font-size: 9px;
  letter-spacing: 3px;
}
.answer-book__cover-front strong {
  font-family: Georgia, 'Songti SC', serif;
  font-size: 30px;
  font-weight: 500;
  letter-spacing: 8px;
  text-indent: 8px;
}
.answer-book__cover-front span {
  margin-top: 13px;
  color: rgb(247 229 174 / 82%);
  font-size: 10px;
  letter-spacing: 2px;
}
.answer-book__cover-back {
  display: grid;
  place-items: center;
  border: 1px solid #d8cfbc;
  border-radius: 12px 4px 4px 12px;
  color: #8c7c5e;
  background: linear-gradient(270deg, #ded4c0, #f8f0df 7%, #fffaf0 94%);
  box-shadow: -8px 12px 18px rgb(69 59 38 / 15%);
  transform: rotateY(180deg);
}
.answer-book__cover-back span {
  padding: 18px 22px;
  border: 1px solid rgb(115 91 48 / 26%);
  font-family: 'Kaiti SC', STKaiti, KaiTi, serif;
  font-size: 15px;
  line-height: 2;
  letter-spacing: 0.18em;
  text-align: center;
}
.answer-book__spine {
  position: absolute;
  z-index: 6;
  top: 3px;
  bottom: 3px;
  left: 50%;
  width: 2px;
  opacity: 0;
  background: linear-gradient(#aa9365, #eadbad 15%, #9b8255 85%, #ddc990);
  box-shadow: 0 0 12px rgb(66 49 22 / 42%);
  transition: opacity 0.35s ease 0.72s;
  pointer-events: none;
}
.answer-book.is-opening,
.answer-book.is-open {
  transform: translateX(0);
}
.answer-book.is-opening .answer-book__left-page,
.answer-book.is-open .answer-book__left-page {
  opacity: 1;
  transform: scaleX(1);
}
.answer-book.is-opening .answer-book__cover,
.answer-book.is-open .answer-book__cover,
.answer-book.is-opening .answer-book__turning-page,
.answer-book.is-open .answer-book__turning-page {
  transform: rotateY(-178deg);
}
.answer-book.is-opening .answer-book__cover {
  animation: answer-book-open-cover 0.96s cubic-bezier(0.18, 0.72, 0.18, 1) both;
}
.answer-book.is-opening .answer-book__spine,
.answer-book.is-open .answer-book__spine {
  opacity: 1;
}
.answer-book.is-open .answer-book__answer {
  opacity: 1;
  transform: translateY(0) scale(1);
  transition-delay: 0.16s;
}
.answer-book.is-open .answer-book__right-page {
  animation: answer-book-reveal 0.72s ease-out;
}
.answer-book.is-page-resetting .answer-book__turning-page {
  transform: rotateY(0) !important;
  transition: none !important;
}
.answer-book.is-page-resetting .answer-book__turning-answer,
.answer-book.is-turning .answer-book__turning-answer {
  opacity: 1;
}
.answer-book.is-page-resetting .answer-book__whisper,
.answer-book.is-turning .answer-book__whisper,
.answer-book.is-closing .answer-book__whisper {
  opacity: 0;
}
.answer-book.is-turning .answer-book__turning-page {
  transform: rotateY(-178deg);
  transition-delay: 0s;
}
.answer-book.is-closing {
  transform: translateX(-25%);
  transition-delay: 0.32s;
}
.answer-book.is-closing .answer-book__cover {
  transform: rotateY(0);
  transition-delay: 0.35s;
}
.answer-book.is-closing .answer-book__turning-page {
  transform: rotateY(0);
  transition-delay: 0s;
}
.answer-book.is-closing .answer-book__answer {
  opacity: 1;
  transform: translateY(0) scale(1);
}
.answer-book.is-closing .answer-book__left-page {
  opacity: 0;
  transform: scaleX(0.28);
  transition-delay: 0.55s;
}
.answer-book.is-closing .answer-book__spine {
  opacity: 0;
  transition-delay: 0.38s;
}
.answer-book-hint {
  position: relative;
  z-index: 1;
  margin: 14px 0 0;
  color: #5c6557;
  font-family: 'Kaiti SC', STKaiti, KaiTi, serif;
  font-size: 14px;
  letter-spacing: 0.08em;
  text-align: center;
}
.answer-book-guidance {
  position: relative;
  z-index: 1;
  margin: 5px 0 0;
  color: color-mix(in srgb, var(--color-text-muted) 72%, transparent);
  font-size: 9px;
  letter-spacing: 0.05em;
  text-align: center;
}
.answer-book-actions {
  justify-content: center;
  flex-wrap: wrap;
  padding: 13px 15px 7px;
}
.answer-book-actions button {
  display: inline-flex;
  min-height: 36px;
  padding: 0 12px;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-muted);
  background: var(--color-surface-solid);
  font-size: 10px;
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}
.answer-book-actions button:hover {
  border-color: color-mix(in srgb, var(--tools-accent) 45%, var(--color-border));
  color: var(--tools-accent);
  transform: translateY(-1px);
}
.answer-book-actions button:active {
  transform: translateY(0) scale(0.97);
}
.answer-book-actions .answer-book-actions__primary {
  min-height: 40px;
  padding-inline: 19px;
  border-color: var(--tools-accent);
  color: #fff;
  background: var(--tools-accent);
  box-shadow: 0 5px 13px color-mix(in srgb, var(--tools-accent) 20%, transparent);
}
.answer-book-actions .answer-book-actions__primary:hover {
  color: #fff;
  box-shadow: 0 7px 17px color-mix(in srgb, var(--tools-accent) 27%, transparent);
}
.answer-book-actions button:focus-visible,
.answer-book-history-button:focus-visible,
.answer-book-mode button:focus-visible,
.answer-book-themes button:focus-visible,
.answer-book-share__question button:focus-visible,
.answer-book-share__download:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--tools-accent) 45%, transparent);
  outline-offset: 2px;
}
.answer-book-notice {
  min-height: 18px;
  margin: 7px 15px 11px;
  font-size: 10px;
  text-align: center;
}
.answer-book-layer {
  --tools-accent: var(--tools-category-misc);

  position: fixed;
  z-index: 9999;
  inset: 0;
  display: flex;
  padding: 18px;
  align-items: flex-end;
  justify-content: center;
  background: rgb(13 18 13 / 62%);
  backdrop-filter: blur(4px);
}
.answer-book-layer--center {
  align-items: center;
}
.answer-book-dialog {
  width: min(100%, 680px);
  max-height: min(78vh, 720px);
  padding: 18px;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  color: var(--color-text);
  background: var(--color-surface-solid);
  box-shadow: 0 16px 50px rgb(0 0 0 / 28%);
}
.answer-book-dialog > header {
  margin-bottom: 14px;
}
.answer-book-dialog > header h2 {
  margin: 0;
  font-size: 14px;
}
.answer-book-dialog > header button,
.answer-book-history article button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 6px;
  color: var(--color-text-muted);
  background: transparent;
}
.answer-book-history article {
  position: relative;
  display: grid;
  padding: 12px 38px 12px 0;
  border-bottom: 1px solid var(--color-border);
  gap: 5px;
}
.answer-book-history article p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 10px;
}
.answer-book-history article strong {
  color: var(--color-text);
  font-size: 11px;
  line-height: 1.6;
}
.answer-book-history article small {
  color: var(--color-text-muted);
  font-size: 9px;
}
.answer-book-history article button {
  position: absolute;
  top: 10px;
  right: 0;
  color: var(--color-danger);
}
.answer-book-history__empty {
  padding: 26px 0;
  color: var(--color-text-muted);
  font-size: 11px;
  text-align: center;
}
.answer-book-dialog__danger {
  margin-top: 14px;
}
.answer-book-share {
  width: min(100%, 820px);
  max-height: min(92vh, 880px);
}
.answer-book-share__preview {
  padding: 11px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  background: color-mix(in srgb, #b79d6d 18%, var(--color-surface-soft));
}
.answer-book-share__preview canvas {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 4px;
  background: #faf5e8;
  box-shadow: 0 8px 24px rgb(66 50 27 / 16%);
}
.answer-book-share__controls {
  margin-top: 15px;
}
.answer-book-share__question {
  color: var(--color-text-muted);
  font-size: 10px;
}
.answer-book-share__question button {
  position: relative;
  width: 42px;
  height: 24px;
  padding: 0;
  border-radius: 12px;
  background: var(--color-border-strong);
  transition: background 0.2s;
}
.answer-book-share__question button::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgb(0 0 0 / 22%);
  content: '';
  transition: transform 0.2s;
}
.answer-book-share__question button.is-active {
  background: var(--tools-accent);
}
.answer-book-share__question button.is-active::after {
  transform: translateX(18px);
}
.answer-book-share__download {
  display: inline-flex;
  min-height: 40px;
  padding: 0 17px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: 7px;
  color: #fff;
  background: var(--tools-accent);
  font-size: 10px;
  text-decoration: none;
  transition:
    box-shadow 0.2s ease,
    transform 0.2s ease;
}
.answer-book-share__download:hover:not(.is-disabled) {
  box-shadow: 0 7px 16px color-mix(in srgb, var(--tools-accent) 24%, transparent);
  transform: translateY(-1px);
}
.answer-book-share__download:active:not(.is-disabled) {
  transform: scale(0.98);
}
.answer-book-share__download.is-disabled {
  opacity: 0.58;
  pointer-events: none;
}
.answer-book-share__notice {
  min-height: 18px;
  margin: 9px 0 0;
  color: var(--color-text-muted);
  font-size: 9px;
  text-align: center;
}
@keyframes answer-book-reveal {
  0% {
    box-shadow:
      3px 2px 0 #eee5d4,
      6px 4px 0 #e5dbc8,
      9px 7px 18px rgb(62 57 40 / 12%);
  }
  48% {
    box-shadow:
      3px 2px 0 #eee5d4,
      6px 4px 0 #e5dbc8,
      0 0 30px rgb(195 157 74 / 24%),
      9px 10px 25px rgb(62 57 40 / 16%);
  }
  100% {
    box-shadow:
      3px 2px 0 #eee5d4,
      6px 4px 0 #e5dbc8,
      9px 7px 18px rgb(62 57 40 / 12%);
  }
}
@keyframes answer-book-open-cover {
  0% {
    transform: translateY(0) rotateY(0);
  }
  16% {
    transform: translateY(-6px) rotateY(-2deg);
  }
  30% {
    transform: translateY(-6px) rotateY(-14deg);
  }
  100% {
    transform: translateY(0) rotateY(-178deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .answer-book,
  .answer-book__cover,
  .answer-book__turning-page,
  .answer-book__left-page,
  .answer-book__answer,
  .answer-book__spine,
  .answer-book__right-page {
    animation: none !important;
    transition-duration: 0.01ms !important;
    transition-delay: 0ms !important;
  }
  .answer-book-mode-panel-enter-active,
  .answer-book-mode-panel-leave-active {
    transition-duration: 0.01ms !important;
  }
}
@container (max-width: 760px) {
  .answer-book-grid {
    grid-template-columns: 1fr;
  }
  .answer-book-stage {
    min-height: 420px;
  }
}
@container (max-width: 520px) {
  .answer-book-panel__head {
    padding: 0 12px;
  }
  .answer-book-panel__body {
    padding: 12px;
  }
  .answer-book-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .answer-book-stage {
    min-height: 304px;
    padding: 20px 5px 15px;
  }
  .answer-book-status {
    top: 12px;
    right: 12px;
  }
  .answer-book {
    width: 100%;
    height: auto;
    aspect-ratio: 2.16 / 1;
  }
  .answer-book__cover-front strong {
    font-size: 21px;
    letter-spacing: 4px;
    text-indent: 4px;
  }
  .answer-book__cover-front small,
  .answer-book__cover-front span,
  .answer-book__left-page > span {
    font-size: 7px;
    letter-spacing: 1px;
  }
  .answer-book__cover-back span {
    padding: 12px;
    font-size: 10px;
    line-height: 1.7;
    letter-spacing: 0.1em;
  }
  .answer-book__answer,
  .answer-book__turning-answer {
    inset: 14px 9px;
  }
  .answer-book__answer p,
  .answer-book__turning-answer p {
    line-height: 1.45;
    letter-spacing: 0.04em;
  }
  .answer-book__text--short {
    font-size: 20px;
  }
  .answer-book__text--medium {
    font-size: 18px;
  }
  .answer-book__text--long {
    font-size: 16px;
  }
  .answer-book__answer small,
  .answer-book__turning-answer small {
    margin-top: 10px;
    font-size: 7px;
  }
  .answer-book-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .is-daily-mode .answer-book-actions {
    grid-template-columns: repeat(3, 1fr);
  }
  .answer-book-actions button {
    justify-content: center;
  }
  .answer-book-layer {
    padding: 9px;
  }
  .answer-book-dialog {
    padding: 14px;
  }
  .answer-book-share__controls {
    align-items: stretch;
    flex-direction: column;
  }
  .answer-book-share__download {
    width: 100%;
    box-sizing: border-box;
  }
}
</style>
