import {
  conversationTitle,
  newId,
  type Conversation,
  type Message,
  type MessageStatus,
} from './types';

export interface ChatRepository {
  list(): Promise<Conversation[]>;
  messages(id: string): Promise<Message[]>;
  create(conversation: Conversation): Promise<void>;
  saveDraft(id: string, draft: string): Promise<void>;
  prepare(id: string, content: string, retryId?: string): Promise<Message>;
  finish(
    message: Message,
    status: MessageStatus,
    output?: string,
    error?: string,
  ): Promise<boolean>;
  remove(id: string): Promise<void>;
  recover(): Promise<void>;
}

function read<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('本地数据读取失败。'));
  });
}

export function createRepository(databaseName = 'meowv-studio-prompt-enhancer'): ChatRepository {
  let databasePromise: Promise<IDBDatabase> | null = null;
  function open(): Promise<IDBDatabase> {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (!globalThis.indexedDB) return reject(new Error('当前浏览器无法使用 IndexedDB。'));
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('conversations', { keyPath: 'id' });
        const messages = db.createObjectStore('messages', { keyPath: 'id' });
        messages.createIndex('conversationId', 'conversationId');
      };
      request.onerror = () => reject(new Error('无法打开本地历史记录。'));
      request.onblocked = () =>
        reject(new Error('本地数据库被其他页面占用，请关闭其他工具页面后重试。'));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          databasePromise = null;
        };
        resolve(db);
      };
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
    return databasePromise;
  }

  async function transaction<T>(
    mode: IDBTransactionMode,
    work: (tx: IDBTransaction) => Promise<T>,
  ): Promise<T> {
    const db = await open();
    const tx = db.transaction(['conversations', 'messages'], mode);
    const completion = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () =>
        reject(new Error('本地保存失败，请检查浏览器存储空间或权限。'));
    });
    try {
      const result = await work(tx);
      await completion;
      return result;
    } catch (cause) {
      try {
        tx.abort();
      } catch {
        /* 事务可能已结束。 */
      }
      await completion.catch(() => {});
      throw cause;
    }
  }

  const conversation = (tx: IDBTransaction, id: string) =>
    read<Conversation | undefined>(tx.objectStore('conversations').get(id));
  const history = async (tx: IDBTransaction, id: string) => {
    const rows = await read<Message[]>(
      tx.objectStore('messages').index('conversationId').getAll(id),
    );
    return rows.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  };

  return {
    list: () =>
      transaction('readonly', async (tx) => {
        const rows = await read<Conversation[]>(tx.objectStore('conversations').getAll());
        return rows.sort((a, b) => b.updatedAt - a.updatedAt || b.id.localeCompare(a.id));
      }),
    messages: (id) => transaction('readonly', (tx) => history(tx, id)),
    create: (value) =>
      transaction('readwrite', async (tx) => {
        tx.objectStore('conversations').add({ ...value });
      }),
    saveDraft: (id, draft) =>
      transaction('readwrite', async (tx) => {
        const row = await conversation(tx, id);
        if (row) tx.objectStore('conversations').put({ ...row, draft });
      }),
    prepare: (id, content, retryId) =>
      transaction('readwrite', async (tx) => {
        const row = await conversation(tx, id);
        if (!row) throw new Error('对话已不存在，请新建对话。');
        const rows = await history(tx, id);
        if (rows.some((item) => item.status === 'pending'))
          throw new Error('此对话仍有未结束的请求。');
        const previous = retryId ? rows.find((item) => item.id === retryId) : null;
        if (
          retryId &&
          (!previous ||
            previous !== rows.at(-1) ||
            previous.role !== 'user' ||
            previous.status === 'complete')
        )
          throw new Error('只能重试最后一条未完成的消息。');
        const message: Message = previous
          ? { ...previous, status: 'pending', error: undefined }
          : {
              id: newId(),
              conversationId: id,
              role: 'user',
              content,
              status: 'pending',
              createdAt: Math.max(Date.now(), (rows.at(-1)?.createdAt ?? 0) + 1),
            };
        tx.objectStore('messages').put(message);
        tx.objectStore('conversations').put({
          ...row,
          title: rows.length ? row.title : conversationTitle(content),
          updatedAt: Date.now(),
          draft: retryId ? row.draft : '',
        });
        return message;
      }),
    finish: (message, status, output, error) =>
      transaction('readwrite', async (tx) => {
        const row = await conversation(tx, message.conversationId);
        const stored = await read<Message | undefined>(tx.objectStore('messages').get(message.id));
        if (!row || !stored || stored.status !== 'pending') return false;
        tx.objectStore('messages').put({ ...stored, status, error });
        if (output !== undefined) {
          tx.objectStore('messages').add({
            id: newId(),
            conversationId: row.id,
            role: 'assistant',
            content: output,
            status: 'complete',
            createdAt: Math.max(Date.now(), message.createdAt + 1),
          } satisfies Message);
        }
        tx.objectStore('conversations').put({ ...row, updatedAt: Date.now() });
        return true;
      }),
    remove: (id) =>
      transaction('readwrite', async (tx) => {
        const rows = await history(tx, id);
        for (const message of rows) tx.objectStore('messages').delete(message.id);
        tx.objectStore('conversations').delete(id);
      }),
    recover: () =>
      transaction('readwrite', async (tx) => {
        const messages = tx.objectStore('messages');
        const rows = await read<Message[]>(messages.getAll());
        for (const row of rows)
          if (row.status === 'pending')
            messages.put({ ...row, status: 'interrupted', error: '上次请求已中断，请手动重试。' });
      }),
  };
}
