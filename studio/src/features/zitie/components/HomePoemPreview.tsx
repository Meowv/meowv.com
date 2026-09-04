'use client';

import { useEffect, useState } from 'react';
import { CLASSIC_SEVEN_CHARACTER_POEMS, getRandomPoem, type Poem } from '../config/poems';
import { Printer } from './Icons';

const initialPoem: Poem = CLASSIC_SEVEN_CHARACTER_POEMS[0]!;
const punctuation = new Set(['，', '。']);

function formatPracticeCharacters(content: string): string[] {
  const lines = content.match(/[^，。]+[，。]?/gu) ?? [content];

  return lines.flatMap((line, index) => [
    ...Array.from(line),
    ...(index < lines.length - 1 ? Array.from({ length: 8 }, () => ' ') : []),
  ]);
}

export default function HomePoemPreview() {
  const [poem, setPoem] = useState(initialPoem);
  const sampleTitle = `${poem.title} · ${poem.author}`;
  const sampleVerse = poem.content;
  const practiceCharacters = formatPracticeCharacters(sampleVerse);

  useEffect(() => {
    // 首页为静态导出，需在浏览器端随机，避免构建时固定为同一首诗。
    setPoem(getRandomPoem());
  }, []);

  return (
    <section className="home-preview" aria-label="字帖效果预览">
      <div className="home-preview__backdrop" aria-hidden="true" />
      <div className="home-preview__tag">
        <Printer size={15} weight="bold" /> A4 练字纸
      </div>
      <div className="home-preview__seal" aria-hidden="true">
        <span>练</span>
        <span>字</span>
      </div>
      <div className="home-preview__paper">
        <div className="home-paper__header">
          <img src="/zitie/brand/logo.png" alt="" width="35" height="35" />
          <span>字帖</span>
          <i />
          <em>{sampleTitle}</em>
        </div>
        <div className="home-paper__grid" aria-label={sampleVerse}>
          {practiceCharacters.map((character, index) => (
            <div
              className={`home-paper__cell${index === 0 || index === 16 || index === 32 || index === 48 ? ' is-highlight' : ''}${punctuation.has(character) ? ' is-punctuation' : ''}`}
              key={`${character}-${index}`}
            >
              <strong>{character}</strong>
            </div>
          ))}
        </div>
        <div className="home-paper__footer">
          <span>一笔一画，写好中国字</span>
          <i />
          <span>A4 · 田字格</span>
        </div>
      </div>
    </section>
  );
}
