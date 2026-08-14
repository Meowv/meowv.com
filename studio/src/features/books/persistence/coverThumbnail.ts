/**
 * 把图片源绘制为 180x252 的书架封面缩略图（居中、contain 缩放、米色底）。
 * 返回 PNG/JPEG Blob；失败或环境不支持时返回 undefined。
 */
export async function drawCoverThumbnail(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): Promise<Blob | undefined> {
  const canvas = document.createElement('canvas');
  canvas.width = 180;
  canvas.height = 252;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return undefined;
  context.fillStyle = '#ead0aa';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(
    source,
    (canvas.width - drawWidth) / 2,
    (canvas.height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
  const result = (await canvasBlob(canvas)) ?? undefined;
  canvas.width = 1;
  canvas.height = 1;
  return result;
}

/**
 * 绘制 180x252 的书名占位封面（米色底，与真实封面缩略图一致）。
 * 用于无法轻量提取封面内容的内置书（如 PDF），打开书籍后由真实封面替换。
 */
export async function drawPlaceholderCover(
  title: string,
  authors?: readonly string[],
): Promise<Blob | undefined> {
  const canvas = document.createElement('canvas');
  canvas.width = 180;
  canvas.height = 252;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return undefined;
  const fontFamily = '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  context.fillStyle = '#ead0aa';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = 'rgba(120, 90, 60, 0.3)';
  context.lineWidth = 1;
  context.strokeRect(13, 11, canvas.width - 26, canvas.height - 22);
  const lines: string[] = [];
  const clean = title.trim();
  if (clean) {
    context.font = `700 16px ${fontFamily}`;
    const maxWidth = canvas.width - 44;
    let line = '';
    for (const char of clean) {
      const next = line + char;
      if (line && context.measureText(next).width > maxWidth) {
        lines.push(line);
        line = char;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  const fontSize = lines.length > 1 ? 15 : 18;
  context.font = `700 ${fontSize}px ${fontFamily}`;
  context.fillStyle = '#4a3a28';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const lineHeight = fontSize + 8;
  const startY = (canvas.height - lines.length * lineHeight) / 2 + 8;
  lines.forEach((line, index) =>
    context.fillText(line, canvas.width / 2, startY + index * lineHeight),
  );
  const author = (authors ?? []).filter(Boolean).join('、');
  if (author) {
    context.font = `11px ${fontFamily}`;
    context.fillStyle = 'rgba(74, 58, 40, 0.72)';
    context.fillText(author, canvas.width / 2, canvas.height - 30);
  }
  const result = (await canvasBlob(canvas)) ?? undefined;
  canvas.width = 1;
  canvas.height = 1;
  return result;
}

async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  if (typeof canvas.toBlob !== 'function') return null;
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.78));
}
