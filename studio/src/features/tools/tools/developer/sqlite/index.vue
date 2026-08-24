<script setup lang="ts">
import {
  IconChevronDown,
  IconDatabase,
  IconDownload,
  IconFilePlus,
  IconFileUpload,
  IconLayoutSidebarLeftCollapse,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTable,
  IconTerminal2,
  IconTrash,
  IconX,
} from '@tabler/icons-vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { downloadBlob } from '@/core/browser/download';
import SqlCodeEditor from './components/SqlCodeEditor.vue';
import { useSqliteWorker } from './composables/useSqliteWorker';
import type {
  DatabaseMeta,
  QueryResult,
  RowIdentity,
  SchemaObject,
  SqlValue,
  TablePage,
  TableSchema,
} from './types';

type WorkspaceTab = 'browse' | 'sql' | 'structure';
type EditorMode = 'insert' | 'update';

const ACCEPTED_FILES = '.db,.sqlite,.sqlite3,.db3,application/x-sqlite3,application/vnd.sqlite3';
const PAGE_SIZES = [20, 50, 100, 200, 500];
const { request } = useSqliteWorker();
const fileInput = ref<HTMLInputElement | null>(null);
const activeTab = ref<WorkspaceTab>('browse');
const meta = ref<DatabaseMeta | null>(null);
const schemaObjects = ref<SchemaObject[]>([]);
const selectedTable = ref('');
const selectedSchema = ref<TableSchema | null>(null);
const pageData = ref<TablePage | null>(null);
const page = ref(1);
const pageSize = ref(50);
const search = ref('');
const searchColumn = ref('');
const sortColumn = ref('');
const sortDirection = ref<'asc' | 'desc'>('asc');
const sql = ref(
  '-- 打开数据库后，在这里执行 SQLite SQL\nSELECT name, type FROM sqlite_schema ORDER BY type, name;',
);
const sqlResult = ref<QueryResult | null>(null);
const busy = ref(false);
const status = ref('');
const error = ref('');
const isDirty = ref(false);
const sidebarOpen = ref(true);
const dragging = ref(false);
const editorMode = ref<EditorMode>('insert');
const editingIdentity = ref<RowIdentity | null>(null);
const formValues = ref<Record<string, string>>({});
const nullColumns = ref(new Set<string>());
const rowEditorOpen = ref(false);

const tables = computed(() => schemaObjects.value.filter((object) => object.type === 'table'));
const views = computed(() => schemaObjects.value.filter((object) => object.type === 'view'));
const indexes = computed(() => schemaObjects.value.filter((object) => object.type === 'index'));
const triggers = computed(() => schemaObjects.value.filter((object) => object.type === 'trigger'));
const hasDatabase = computed(() => meta.value !== null);
const totalPages = computed(() =>
  Math.max(1, Math.ceil((pageData.value?.total ?? 0) / pageSize.value)),
);
const rawColumns = computed(() => {
  if (!pageData.value) return [];
  return pageData.value.identityColumns[0] === '__studio_rowid__'
    ? ['__studio_rowid__', ...pageData.value.columns.map((column) => column.name)]
    : pageData.value.columns.map((column) => column.name);
});

function showStatus(message: string): void {
  status.value = message;
  error.value = '';
}

function showError(value: unknown): void {
  error.value = value instanceof Error ? value.message : '操作失败，请稍后重试。';
  status.value = '';
}

function valueLabel(value: SqlValue): string {
  if (value === null) return 'NULL';
  if (value instanceof Uint8Array) return `BLOB · ${formatBytes(value.byteLength)}`;
  return String(value);
}

function isBlob(value: SqlValue): value is Uint8Array {
  return value instanceof Uint8Array;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function visibleValues(row: SqlValue[]): SqlValue[] {
  return pageData.value?.identityColumns[0] === '__studio_rowid__' ? row.slice(1) : row;
}

function rowIdentity(row: SqlValue[]): RowIdentity | null {
  const identityColumns = [...(pageData.value?.identityColumns ?? [])];
  if (!identityColumns.length) return null;
  const values = identityColumns.map((column) => row[rawColumns.value.indexOf(column)] ?? null);
  return { columns: identityColumns, values };
}

function csvCell(value: SqlValue): string {
  const text = valueLabel(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function resetBrowserState(): void {
  selectedTable.value = '';
  selectedSchema.value = null;
  pageData.value = null;
  page.value = 1;
  search.value = '';
  searchColumn.value = '';
  sortColumn.value = '';
  sqlResult.value = null;
  isDirty.value = false;
}

async function refreshSchema(selectFirst = false): Promise<void> {
  schemaObjects.value = await request<SchemaObject[]>('schema');
  if (selectFirst && tables.value.length) await selectObject(tables.value[0]!.name);
}

async function openDatabase(file: File): Promise<void> {
  busy.value = true;
  error.value = '';
  try {
    const buffer = await file.arrayBuffer();
    await request<SchemaObject[]>('open', { buffer }, [buffer]);
    meta.value = {
      fileName: file.name,
      fileSize: file.size,
      openedAt: Date.now(),
      source: 'file-input',
    };
    resetBrowserState();
    await refreshSchema(true);
    showStatus(`已在当前浏览器打开 ${file.name}。`);
  } catch (cause) {
    showError(cause);
  } finally {
    busy.value = false;
  }
}

async function createDatabase(demo = false): Promise<void> {
  busy.value = true;
  error.value = '';
  try {
    await request('new');
    meta.value = {
      fileName: demo ? 'studio-demo.sqlite' : 'database.sqlite',
      fileSize: 0,
      openedAt: Date.now(),
      source: demo ? 'demo' : 'new',
    };
    resetBrowserState();
    if (demo) {
      await request<QueryResult>('execute', {
        sql: `CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, owner TEXT, status TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
INSERT INTO projects (name, owner, status) VALUES ('Studio Tools', 'Meowv', '进行中'), ('SQLite Online', 'Meowv', '已完成'), ('本地优先', 'Studio', '规划中');`,
      });
      isDirty.value = false;
    }
    await refreshSchema(true);
    showStatus(demo ? '已创建演示数据库。' : '已创建空数据库。');
  } catch (cause) {
    showError(cause);
  } finally {
    busy.value = false;
  }
}

async function selectObject(tableName: string): Promise<void> {
  if (!hasDatabase.value) return;
  busy.value = true;
  try {
    selectedTable.value = tableName;
    selectedSchema.value = await request<TableSchema>('table-schema', { tableName });
    searchColumn.value = '';
    sortColumn.value = '';
    page.value = 1;
    await refreshPage();
    activeTab.value = 'browse';
  } catch (cause) {
    showError(cause);
  } finally {
    busy.value = false;
  }
}

async function refreshPage(): Promise<void> {
  if (!selectedTable.value) return;
  const result = await request<TablePage>('table-page', {
    tableName: selectedTable.value,
    page: page.value,
    pageSize: pageSize.value,
    search: search.value,
    searchColumn: searchColumn.value,
    sortColumn: sortColumn.value,
    sortDirection: sortDirection.value,
  });
  if (result.page > 1 && result.rows.length === 0 && result.total > 0) {
    page.value = Math.max(1, Math.ceil(result.total / pageSize.value));
    return refreshPage();
  }
  pageData.value = result;
}

async function runSql(): Promise<void> {
  if (!hasDatabase.value || !sql.value.trim()) return;
  busy.value = true;
  error.value = '';
  try {
    sqlResult.value = await request<QueryResult>('execute', { sql: sql.value });
    if (sqlResult.value.didMutate) {
      isDirty.value = true;
      await refreshSchema();
      if (selectedTable.value) await refreshPage();
    }
    showStatus(
      sqlResult.value.truncated
        ? `已显示前 5,000 行结果（${sqlResult.value.elapsedMs} ms）。`
        : `执行完成（${sqlResult.value.elapsedMs} ms）。`,
    );
  } catch (cause) {
    showError(cause);
  } finally {
    busy.value = false;
  }
}

function openRowEditor(mode: EditorMode, row?: SqlValue[]): void {
  if (!selectedSchema.value) return;
  editorMode.value = mode;
  editingIdentity.value = row ? rowIdentity(row) : null;
  nullColumns.value = new Set();
  formValues.value = Object.fromEntries(
    selectedSchema.value.columns.map((column, index) => {
      const value = row ? visibleValues(row)[index] : '';
      if (value === null) nullColumns.value.add(column.name);
      return [column.name, value instanceof Uint8Array ? '' : value === null ? '' : String(value)];
    }),
  );
  rowEditorOpen.value = true;
}

function formSqlValue(column: TableSchema['columns'][number]): SqlValue {
  if (nullColumns.value.has(column.name)) return null;
  const rawValue: unknown = formValues.value[column.name];
  const value = rawValue === null || rawValue === undefined ? '' : String(rawValue);
  if (
    /INT|REAL|FLOA|DOUB|NUM/i.test(column.type) &&
    value.trim() !== '' &&
    Number.isFinite(Number(value))
  ) {
    return Number(value);
  }
  return value;
}

async function submitRow(): Promise<void> {
  if (!selectedSchema.value || !selectedTable.value) return;
  busy.value = true;
  try {
    const values = Object.fromEntries(
      selectedSchema.value.columns
        .filter(
          (column) =>
            editorMode.value === 'update' ||
            formValues.value[column.name] !== '' ||
            nullColumns.value.has(column.name),
        )
        .map((column) => [column.name, formSqlValue(column)]),
    );
    if (editorMode.value === 'insert')
      await request('insert', { tableName: selectedTable.value, values });
    else if (editingIdentity.value) {
      const identity: RowIdentity = {
        columns: [...editingIdentity.value.columns],
        values: [...editingIdentity.value.values],
      };
      await request('update', {
        tableName: selectedTable.value,
        values,
        identity,
      });
    }
    rowEditorOpen.value = false;
    isDirty.value = true;
    await refreshPage();
    showStatus(editorMode.value === 'insert' ? '已新增记录。' : '已保存记录。');
  } catch (cause) {
    showError(cause);
  } finally {
    busy.value = false;
  }
}

async function removeRow(row: SqlValue[]): Promise<void> {
  const identity = rowIdentity(row);
  if (!selectedTable.value || !identity) return;
  if (!window.confirm('即将删除这条记录。保存数据库后将无法自动恢复，是否继续？')) return;
  busy.value = true;
  try {
    await request('delete', { tableName: selectedTable.value, identity });
    isDirty.value = true;
    await refreshPage();
    showStatus('已删除记录。');
  } catch (cause) {
    showError(cause);
  } finally {
    busy.value = false;
  }
}

async function saveDatabase(): Promise<void> {
  if (!meta.value) return;
  busy.value = true;
  try {
    const bytes = await request<Uint8Array>('export');
    const copiedBytes = new Uint8Array(bytes.byteLength);
    copiedBytes.set(bytes);
    downloadBlob(
      new Blob([copiedBytes.buffer], { type: 'application/vnd.sqlite3' }),
      meta.value.fileName,
    );
    isDirty.value = false;
    showStatus('已下载当前数据库副本。');
  } catch (cause) {
    showError(cause);
  } finally {
    busy.value = false;
  }
}

function exportCurrentPage(): void {
  if (!pageData.value || !selectedSchema.value) return;
  const lines = [
    selectedSchema.value.columns.map((column) => csvCell(column.name)).join(','),
    ...pageData.value.rows.map((row) => visibleValues(row).map(csvCell).join(',')),
  ];
  downloadBlob(
    new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }),
    `${selectedTable.value || 'query'}-page-${page.value}.csv`,
  );
}

function requestFile(): void {
  fileInput.value?.click();
}

function handleFileInput(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) void openDatabase(file);
  (event.target as HTMLInputElement).value = '';
}

function handleDrop(event: DragEvent): void {
  dragging.value = false;
  const file = event.dataTransfer?.files[0];
  if (file) void openDatabase(file);
}

function handleKeyboard(event: KeyboardEvent): void {
  if (!event.metaKey && !event.ctrlKey) return;
  if (event.key.toLowerCase() === 'o') {
    event.preventDefault();
    requestFile();
  }
  if (event.key.toLowerCase() === 's' && hasDatabase.value) {
    event.preventDefault();
    void saveDatabase();
  }
}

function preventUnload(event: BeforeUnloadEvent): void {
  if (!isDirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}

watch([pageSize, search, searchColumn, sortColumn, sortDirection], () => {
  page.value = 1;
  if (selectedTable.value) void refreshPage().catch(showError);
});

onMounted(async () => {
  window.addEventListener('keydown', handleKeyboard);
  window.addEventListener('beforeunload', preventUnload);
  try {
    await request('init');
  } catch (cause) {
    showError(cause);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyboard);
  window.removeEventListener('beforeunload', preventUnload);
});
</script>

<template>
  <section class="sqlite-tool" aria-label="SQLite Online">
    <input ref="fileInput" type="file" :accept="ACCEPTED_FILES" hidden @change="handleFileInput" />

    <div
      v-if="!hasDatabase"
      class="sqlite-welcome"
      :class="{ 'is-dragging': dragging }"
      @dragenter.prevent="dragging = true"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="handleDrop"
    >
      <span class="sqlite-welcome__icon"><IconDatabase :size="34" /></span>
      <h2>在浏览器中打开 SQLite 数据库</h2>
      <p>数据库只在当前浏览器内存中运行，不会上传。修改后请下载保存副本。</p>
      <div class="sqlite-welcome__actions">
        <button
          class="tool-button tool-button--primary"
          type="button"
          :disabled="busy"
          @click="requestFile"
        >
          <IconFileUpload :size="17" />打开数据库
        </button>
        <button class="tool-button" type="button" :disabled="busy" @click="createDatabase()">
          <IconFilePlus :size="17" />新建空数据库
        </button>
        <button class="tool-button" type="button" :disabled="busy" @click="createDatabase(true)">
          打开演示数据库
        </button>
      </div>
      <span class="sqlite-welcome__hint">也可将 .db、.sqlite、.sqlite3 或 .db3 文件拖到这里</span>
      <p v-if="error" class="sqlite-message sqlite-message--error" role="alert">{{ error }}</p>
    </div>

    <template v-else>
      <header class="sqlite-toolbar">
        <div class="sqlite-toolbar__title">
          <IconDatabase :size="20" />
          <span>{{ meta?.fileName }}</span
          ><strong v-if="isDirty" aria-label="存在未保存修改">*</strong>
        </div>
        <div class="sqlite-toolbar__actions">
          <button class="tool-button" type="button" :disabled="busy" @click="requestFile">
            <IconFileUpload :size="16" />打开
          </button>
          <button class="tool-button" type="button" :disabled="busy" @click="createDatabase()">
            <IconFilePlus :size="16" />新建
          </button>
          <button
            class="tool-button tool-button--primary"
            type="button"
            :disabled="busy"
            @click="saveDatabase"
          >
            <IconDownload :size="16" />下载数据库
          </button>
        </div>
      </header>

      <p
        v-if="status || error"
        class="sqlite-message"
        :class="{ 'sqlite-message--error': error }"
        role="status"
      >
        {{ error || status }}
      </p>

      <div class="sqlite-workspace" :class="{ 'sqlite-workspace--sidebar-closed': !sidebarOpen }">
        <aside v-if="sidebarOpen" class="sqlite-explorer">
          <div class="sqlite-explorer__heading">
            <strong>数据库结构</strong
            ><button type="button" aria-label="折叠结构面板" @click="sidebarOpen = false">
              <IconLayoutSidebarLeftCollapse :size="17" />
            </button>
          </div>
          <section
            v-for="group in [
              { label: 'Tables', objects: tables },
              { label: 'Views', objects: views },
              { label: 'Indexes', objects: indexes },
              { label: 'Triggers', objects: triggers },
            ]"
            :key="group.label"
            class="sqlite-schema-group"
          >
            <h3>
              {{ group.label }} <span>{{ group.objects.length }}</span>
            </h3>
            <button
              v-for="object in group.objects"
              :key="object.type + object.name"
              type="button"
              :class="{ 'is-selected': selectedTable === object.name }"
              @click="
                object.type === 'table' || object.type === 'view'
                  ? selectObject(object.name)
                  : ((selectedTable = object.name), (activeTab = 'structure'))
              "
            >
              <IconTable :size="15" />{{ object.name }}
            </button>
          </section>
          <p v-if="!schemaObjects.length" class="sqlite-explorer__empty">数据库中还没有对象。</p>
        </aside>

        <div class="sqlite-main">
          <div class="sqlite-tabs" role="tablist">
            <button
              v-if="!sidebarOpen"
              type="button"
              aria-label="展开结构面板"
              @click="sidebarOpen = true"
            >
              <IconLayoutSidebarLeftCollapse :size="17" />
            </button>
            <button
              :class="{ 'is-active': activeTab === 'browse' }"
              type="button"
              role="tab"
              @click="activeTab = 'browse'"
            >
              <IconTable :size="16" />数据浏览
            </button>
            <button
              :class="{ 'is-active': activeTab === 'sql' }"
              type="button"
              role="tab"
              @click="activeTab = 'sql'"
            >
              <IconTerminal2 :size="16" />执行 SQL
            </button>
            <button
              :class="{ 'is-active': activeTab === 'structure' }"
              type="button"
              role="tab"
              @click="activeTab = 'structure'"
            >
              <IconDatabase :size="16" />数据库结构
            </button>
          </div>

          <section v-if="activeTab === 'browse'" class="sqlite-panel">
            <div v-if="!selectedSchema" class="sqlite-empty">从左侧选择一张数据表或视图。</div>
            <template v-else>
              <div class="sqlite-panel__toolbar">
                <div>
                  <h2>{{ selectedSchema.name }}</h2>
                  <span>{{
                    selectedSchema.type === 'view'
                      ? '视图（只读）'
                      : selectedSchema.editable
                        ? '可编辑'
                        : '只读'
                  }}</span>
                </div>
                <div class="sqlite-panel__actions">
                  <button class="tool-button" type="button" :disabled="busy" @click="refreshPage">
                    <IconRefresh :size="16" />刷新
                  </button>
                  <button
                    class="tool-button"
                    type="button"
                    :disabled="!pageData?.rows.length"
                    @click="exportCurrentPage"
                  >
                    <IconDownload :size="16" />导出当前页 CSV
                  </button>
                  <button
                    class="tool-button tool-button--primary"
                    type="button"
                    :disabled="busy || !selectedSchema.editable"
                    @click="openRowEditor('insert')"
                  >
                    <IconPlus :size="16" />新增记录
                  </button>
                </div>
              </div>
              <div class="sqlite-filters">
                <label
                  ><IconSearch :size="16" /><input
                    v-model="search"
                    type="search"
                    placeholder="筛选当前表"
                /></label>
                <select v-model="searchColumn">
                  <option value="">选择筛选字段</option>
                  <option
                    v-for="column in selectedSchema.columns"
                    :key="column.name"
                    :value="column.name"
                  >
                    {{ column.name }}
                  </option>
                </select>
                <select v-model="sortColumn">
                  <option value="">默认顺序</option>
                  <option
                    v-for="column in selectedSchema.columns"
                    :key="column.name"
                    :value="column.name"
                  >
                    按 {{ column.name }} 排序
                  </option>
                </select>
                <button
                  class="sqlite-sort"
                  type="button"
                  :disabled="!sortColumn"
                  @click="sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'"
                >
                  {{ sortDirection === 'asc' ? '升序' : '降序' }}<IconChevronDown :size="15" />
                </button>
              </div>
              <div class="sqlite-grid-wrap">
                <table class="sqlite-grid">
                  <thead>
                    <tr>
                      <th v-for="column in selectedSchema.columns" :key="column.name">
                        {{ column.name }}<small>{{ column.type || 'ANY' }}</small>
                      </th>
                      <th v-if="selectedSchema.editable" class="sqlite-grid__actions">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, index) in pageData?.rows" :key="index">
                      <td
                        v-for="(value, cellIndex) in visibleValues(row)"
                        :key="cellIndex"
                        :class="{ 'is-null': value === null, 'is-blob': isBlob(value) }"
                        :title="valueLabel(value)"
                      >
                        {{ valueLabel(value) }}
                      </td>
                      <td v-if="selectedSchema.editable" class="sqlite-grid__actions">
                        <button type="button" @click="openRowEditor('update', row)">编辑</button
                        ><button type="button" class="is-danger" @click="removeRow(row)">
                          <IconTrash :size="15" />
                        </button>
                      </td>
                    </tr>
                    <tr v-if="!pageData?.rows.length">
                      <td
                        :colspan="selectedSchema.columns.length + (selectedSchema.editable ? 1 : 0)"
                        class="sqlite-grid__empty"
                      >
                        没有符合条件的记录。
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <footer class="sqlite-pagination">
                <span>{{ pageData?.total ?? 0 }} 条记录</span
                ><label
                  >每页
                  <select v-model.number="pageSize">
                    <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
                  </select>
                  条</label
                ><span>第 {{ page }} / {{ totalPages }} 页</span
                ><button
                  type="button"
                  :disabled="page <= 1 || busy"
                  @click="
                    page -= 1;
                    refreshPage();
                  "
                >
                  上一页</button
                ><button
                  type="button"
                  :disabled="page >= totalPages || busy"
                  @click="
                    page += 1;
                    refreshPage();
                  "
                >
                  下一页
                </button>
              </footer>
            </template>
          </section>

          <section v-else-if="activeTab === 'sql'" class="sqlite-panel sqlite-sql-panel">
            <div class="sqlite-panel__toolbar">
              <div>
                <h2>SQL 编辑器</h2>
                <span>Cmd/Ctrl + Enter 执行</span>
              </div>
              <button
                class="tool-button tool-button--primary"
                type="button"
                :disabled="busy || !sql.trim()"
                @click="runSql"
              >
                <IconPlayerPlay :size="16" />运行 SQL
              </button>
            </div>
            <div class="sqlite-sql-panel__editor">
              <SqlCodeEditor v-model="sql" @run="runSql" />
            </div>
            <div class="sqlite-query-result">
              <p v-if="!sqlResult" class="sqlite-empty">
                运行 SQL 后，结果会显示在这里。为保护浏览器内存，查询最多展示 5,000 行。
              </p>
              <template v-else
                ><p class="sqlite-query-result__meta">
                  {{ sqlResult.rows.length }} 行 · {{ sqlResult.changes }} 行受影响 ·
                  {{ sqlResult.elapsedMs }} ms <span v-if="sqlResult.truncated">· 结果已截断</span>
                </p>
                <div v-if="sqlResult.columns.length" class="sqlite-grid-wrap">
                  <table class="sqlite-grid">
                    <thead>
                      <tr>
                        <th v-for="column in sqlResult.columns" :key="column">{{ column }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(row, index) in sqlResult.rows" :key="index">
                        <td
                          v-for="(value, valueIndex) in row"
                          :key="valueIndex"
                          :class="{ 'is-null': value === null, 'is-blob': isBlob(value) }"
                        >
                          {{ valueLabel(value) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div></template
              >
            </div>
          </section>

          <section v-else class="sqlite-panel">
            <div v-if="selectedSchema" class="sqlite-structure">
              <div>
                <h2>{{ selectedSchema.name }}</h2>
                <span>{{ selectedSchema.type }}</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>字段</th>
                    <th>类型</th>
                    <th>约束</th>
                    <th>默认值</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="column in selectedSchema.columns" :key="column.name">
                    <td>{{ column.name }}</td>
                    <td>{{ column.type || 'ANY' }}</td>
                    <td>
                      <span v-if="column.primaryKeyPosition">PK</span
                      ><span v-if="column.notNull">NOT NULL</span>
                    </td>
                    <td>{{ column.defaultValue ?? '—' }}</td>
                  </tr>
                </tbody>
              </table>
              <pre v-if="selectedSchema.sql">{{ selectedSchema.sql }}</pre>
            </div>
            <div v-else class="sqlite-empty">请选择一个表或视图以查看字段与建表语句。</div>
          </section>
        </div>
      </div>
    </template>

    <div
      v-if="rowEditorOpen && selectedSchema"
      class="sqlite-dialog-backdrop"
      @click.self="rowEditorOpen = false"
    >
      <form class="sqlite-row-editor" @submit.prevent="submitRow">
        <header>
          <div>
            <h2>{{ editorMode === 'insert' ? '新增记录' : '编辑记录' }}</h2>
            <p>{{ selectedSchema.name }}</p>
          </div>
          <button type="button" aria-label="关闭" @click="rowEditorOpen = false">
            <IconX :size="20" />
          </button>
        </header>
        <div class="sqlite-row-editor__fields">
          <label v-for="column in selectedSchema.columns" :key="column.name"
            ><span
              >{{ column.name }} <small>{{ column.type || 'ANY' }}</small></span
            >
            <div>
              <input
                v-model="formValues[column.name]"
                :disabled="nullColumns.has(column.name)"
                :placeholder="column.notNull && !column.defaultValue ? '必填' : '留空则使用默认值'"
                :required="column.notNull && !column.defaultValue && !nullColumns.has(column.name)"
                :type="/INT|REAL|FLOA|DOUB|NUM/i.test(column.type) ? 'number' : 'text'"
              /><button
                type="button"
                :class="{ 'is-active': nullColumns.has(column.name) }"
                @click="
                  nullColumns.has(column.name)
                    ? nullColumns.delete(column.name)
                    : nullColumns.add(column.name);
                  nullColumns = new Set(nullColumns);
                "
              >
                NULL
              </button>
            </div></label
          >
        </div>
        <p v-if="error" class="sqlite-row-editor__error" role="alert">{{ error }}</p>
        <footer>
          <button class="tool-button" type="button" @click="rowEditorOpen = false">取消</button
          ><button class="tool-button tool-button--primary" type="submit" :disabled="busy">
            {{ editorMode === 'insert' ? '新增' : '保存' }}
          </button>
        </footer>
      </form>
    </div>
  </section>
</template>

<style scoped>
.sqlite-tool {
  min-height: 620px;
  color: var(--tools-text, #20232a);
}
.sqlite-welcome {
  display: grid;
  place-items: center;
  min-height: 550px;
  padding: 48px 24px;
  text-align: center;
  border: 1px dashed color-mix(in srgb, var(--tools-accent) 42%, transparent);
  border-radius: 24px;
  background: color-mix(in srgb, var(--tools-accent) 4%, var(--tools-surface, #fff));
  transition:
    border-color 0.15s,
    background 0.15s;
}
.sqlite-welcome.is-dragging {
  border-color: var(--tools-accent);
  background: color-mix(in srgb, var(--tools-accent) 10%, var(--tools-surface, #fff));
}
.sqlite-welcome__icon {
  display: grid;
  place-items: center;
  width: 68px;
  height: 68px;
  margin-bottom: 14px;
  color: var(--tools-accent);
  background: color-mix(in srgb, var(--tools-accent) 12%, transparent);
  border-radius: 19px;
}
.sqlite-welcome h2 {
  margin: 0;
  font-size: clamp(1.45rem, 3vw, 2rem);
}
.sqlite-welcome > p:not(.eyebrow):not(.sqlite-message) {
  max-width: 560px;
  margin: 12px 0 22px;
  color: var(--tools-text-muted, #69707d);
}
.sqlite-welcome__actions,
.sqlite-toolbar__actions,
.sqlite-panel__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.sqlite-welcome__hint {
  margin-top: 17px;
  font-size: 0.8rem;
  color: var(--tools-text-muted, #69707d);
}
.sqlite-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 12px 15px;
  border: 1px solid var(--tools-border, #e5e7eb);
  border-bottom: 0;
  border-radius: 16px 16px 0 0;
  background: var(--tools-surface, #fff);
}
.sqlite-toolbar__title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-weight: 700;
}
.sqlite-toolbar__title span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sqlite-toolbar__title svg,
.sqlite-toolbar__title strong {
  color: var(--tools-accent);
}
.sqlite-message {
  margin: 0;
  padding: 8px 14px;
  color: #1d7a42;
  background: #edf9f0;
  border-inline: 1px solid var(--tools-border, #e5e7eb);
  font-size: 0.85rem;
}
.sqlite-message--error {
  color: #b42318;
  background: #fff0ef;
}
.sqlite-welcome .sqlite-message {
  margin-top: 18px;
  border: 1px solid currentColor;
  border-radius: 10px;
}
.sqlite-workspace {
  display: grid;
  grid-template-columns: minmax(190px, 245px) minmax(0, 1fr);
  min-height: 580px;
  border: 1px solid var(--tools-border, #e5e7eb);
  border-radius: 0 0 16px 16px;
  overflow: hidden;
  background: var(--tools-surface, #fff);
}
.sqlite-workspace--sidebar-closed {
  grid-template-columns: minmax(0, 1fr);
}
.sqlite-explorer {
  padding: 12px 8px;
  border-right: 1px solid var(--tools-border, #e5e7eb);
  background: color-mix(in srgb, var(--tools-surface, #fff) 92%, #eef2f7);
  overflow: auto;
}
.sqlite-explorer__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 7px 12px;
  font-size: 0.86rem;
}
.sqlite-explorer button,
.sqlite-tabs button,
.sqlite-grid__actions button,
.sqlite-row-editor header button {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.sqlite-explorer__heading button {
  display: grid;
  color: var(--tools-text-muted, #69707d);
}
.sqlite-schema-group {
  margin: 0 0 12px;
}
.sqlite-schema-group h3 {
  display: flex;
  justify-content: space-between;
  margin: 0;
  padding: 6px 7px;
  color: var(--tools-text-muted, #69707d);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.sqlite-schema-group h3 span {
  font-weight: 500;
}
.sqlite-schema-group > button {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 7px;
  padding: 7px;
  border-radius: 7px;
  font-size: 0.84rem;
  text-align: left;
}
.sqlite-schema-group > button:hover,
.sqlite-schema-group > button.is-selected {
  background: color-mix(in srgb, var(--tools-accent) 13%, transparent);
  color: var(--tools-accent);
}
.sqlite-explorer__empty {
  padding: 7px;
  color: var(--tools-text-muted, #69707d);
  font-size: 0.83rem;
}
.sqlite-main {
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}
.sqlite-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--tools-border, #e5e7eb);
}
.sqlite-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 7px;
  font-size: 0.85rem;
}
.sqlite-tabs button:hover,
.sqlite-tabs button.is-active {
  color: var(--tools-accent);
  background: color-mix(in srgb, var(--tools-accent) 10%, transparent);
}
.sqlite-panel {
  min-width: 0;
  padding: 18px;
  overflow: auto;
}
.sqlite-panel__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 14px;
}
.sqlite-panel__toolbar h2,
.sqlite-structure h2 {
  margin: 0;
  font-size: 1.05rem;
}
.sqlite-panel__toolbar span,
.sqlite-structure > div > span {
  display: block;
  margin-top: 3px;
  color: var(--tools-text-muted, #69707d);
  font-size: 0.8rem;
}
.sqlite-filters {
  display: flex;
  gap: 8px;
  margin-bottom: 13px;
  flex-wrap: wrap;
}
.sqlite-filters label {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 185px;
  padding: 0 9px;
  border: 1px solid var(--tools-border, #e5e7eb);
  border-radius: 8px;
}
.sqlite-filters input,
.sqlite-filters select,
.sqlite-pagination select {
  min-width: 0;
  height: 35px;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
}
.sqlite-filters > select {
  height: 35px;
  padding: 0 8px;
  border: 1px solid var(--tools-border, #e5e7eb);
  border-radius: 8px;
  background: var(--tools-surface, #fff);
}
.sqlite-sort {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  border: 1px solid var(--tools-border, #e5e7eb);
  border-radius: 8px;
  background: var(--tools-surface, #fff);
  color: inherit;
  cursor: pointer;
}
.sqlite-grid-wrap {
  max-width: 100%;
  overflow: auto;
  border: 1px solid var(--tools-border, #e5e7eb);
  border-radius: 10px;
}
.sqlite-grid {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}
.sqlite-grid th {
  position: sticky;
  top: 0;
  background: color-mix(in srgb, var(--tools-surface, #fff) 93%, #eef2f7);
  text-align: left;
  white-space: nowrap;
}
.sqlite-grid th,
.sqlite-grid td {
  max-width: 310px;
  padding: 9px 11px;
  border-bottom: 1px solid var(--tools-border, #e5e7eb);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sqlite-grid th small {
  display: block;
  margin-top: 2px;
  color: var(--tools-text-muted, #69707d);
  font-size: 0.68rem;
  font-weight: 500;
}
.sqlite-grid tbody tr:last-child td {
  border-bottom: 0;
}
.sqlite-grid td.is-null {
  color: var(--tools-text-muted, #69707d);
  font-style: italic;
}
.sqlite-grid td.is-blob {
  color: #7a4d00;
}
.sqlite-grid__actions {
  width: 90px;
  text-align: right !important;
}
.sqlite-grid__actions button {
  padding: 4px 6px;
  color: var(--tools-accent);
}
.sqlite-grid__actions button.is-danger {
  color: #c23830;
}
.sqlite-grid__empty {
  padding: 28px !important;
  color: var(--tools-text-muted, #69707d);
  text-align: center;
}
.sqlite-pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
  color: var(--tools-text-muted, #69707d);
  font-size: 0.8rem;
}
.sqlite-pagination label {
  display: flex;
  align-items: center;
  gap: 4px;
}
.sqlite-pagination select {
  height: 26px;
}
.sqlite-pagination button {
  padding: 5px 8px;
  border: 1px solid var(--tools-border, #e5e7eb);
  border-radius: 6px;
  background: var(--tools-surface, #fff);
  color: inherit;
  cursor: pointer;
}
.sqlite-pagination button:disabled {
  opacity: 0.45;
  cursor: default;
}
.sqlite-empty {
  display: grid;
  min-height: 260px;
  place-items: center;
  color: var(--tools-text-muted, #69707d);
  text-align: center;
}
.sqlite-sql-panel {
  display: grid;
  grid-template-rows: auto minmax(270px, 1fr) minmax(180px, 0.7fr);
  gap: 14px;
}
.sqlite-sql-panel__editor,
.sqlite-query-result {
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--tools-border, #e5e7eb);
  border-radius: 10px;
}
.sqlite-query-result__meta {
  margin: 0;
  padding: 9px 11px;
  color: var(--tools-text-muted, #69707d);
  font-size: 0.8rem;
  border-bottom: 1px solid var(--tools-border, #e5e7eb);
}
.sqlite-query-result .sqlite-empty {
  min-height: 150px;
}
.sqlite-structure {
  display: grid;
  gap: 16px;
}
.sqlite-structure table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.85rem;
}
.sqlite-structure th,
.sqlite-structure td {
  padding: 10px;
  border-bottom: 1px solid var(--tools-border, #e5e7eb);
}
.sqlite-structure td span {
  display: inline-block;
  margin-right: 5px;
  padding: 2px 5px;
  border-radius: 4px;
  color: var(--tools-accent);
  background: color-mix(in srgb, var(--tools-accent) 11%, transparent);
  font-size: 0.7rem;
}
.sqlite-structure pre {
  margin: 0;
  padding: 14px;
  overflow: auto;
  border-radius: 10px;
  color: #d6e3f0;
  background: #17202a;
  font-size: 0.78rem;
  white-space: pre-wrap;
}
.sqlite-dialog-backdrop {
  position: fixed;
  z-index: 30;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(15 23 42 / 0.42);
}
.sqlite-row-editor {
  width: min(610px, 100%);
  max-height: min(760px, calc(100vh - 40px));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  border-radius: 15px;
  background: var(--tools-surface, #fff);
  box-shadow: 0 20px 70px rgb(0 0 0 / 0.22);
}
.sqlite-row-editor header,
.sqlite-row-editor footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 18px;
  border-bottom: 1px solid var(--tools-border, #e5e7eb);
}
.sqlite-row-editor header h2 {
  margin: 0;
  font-size: 1rem;
}
.sqlite-row-editor header p {
  margin: 3px 0 0;
  color: var(--tools-text-muted, #69707d);
  font-size: 0.8rem;
}
.sqlite-row-editor footer {
  gap: 8px;
  justify-content: flex-end;
  border-top: 1px solid var(--tools-border, #e5e7eb);
  border-bottom: 0;
}
.sqlite-row-editor__fields {
  display: grid;
  gap: 12px;
  padding: 18px;
  overflow: auto;
}
.sqlite-row-editor__error {
  margin: 0 18px 14px;
  padding: 9px 11px;
  border-radius: 7px;
  color: #b42318;
  background: #fff0ef;
  font-size: 0.82rem;
}
.sqlite-row-editor__fields > label > span {
  display: block;
  margin-bottom: 5px;
  font-size: 0.82rem;
  font-weight: 650;
}
.sqlite-row-editor__fields small {
  color: var(--tools-text-muted, #69707d);
  font-weight: 500;
}
.sqlite-row-editor__fields > label > div {
  display: flex;
}
.sqlite-row-editor__fields input {
  min-width: 0;
  flex: 1;
  height: 37px;
  padding: 0 9px;
  border: 1px solid var(--tools-border, #e5e7eb);
  border-radius: 7px 0 0 7px;
  outline-color: var(--tools-accent);
  color: inherit;
  background: transparent;
}
.sqlite-row-editor__fields > label button {
  width: 49px;
  border: 1px solid var(--tools-border, #e5e7eb);
  border-left: 0;
  border-radius: 0 7px 7px 0;
  background: transparent;
  color: var(--tools-text-muted, #69707d);
  font-size: 0.72rem;
  cursor: pointer;
}
.sqlite-row-editor__fields > label button.is-active {
  color: var(--tools-accent);
  background: color-mix(in srgb, var(--tools-accent) 10%, transparent);
}
@media (max-width: 760px) {
  .sqlite-toolbar,
  .sqlite-panel__toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
  .sqlite-workspace {
    display: block;
    min-height: 540px;
  }
  .sqlite-explorer {
    max-height: 180px;
    border-right: 0;
    border-bottom: 1px solid var(--tools-border, #e5e7eb);
  }
  .sqlite-explorer__heading button {
    display: none;
  }
  .sqlite-tabs {
    overflow-x: auto;
  }
  .sqlite-panel {
    padding: 13px;
  }
  .sqlite-panel__toolbar,
  .sqlite-pagination {
    flex-wrap: wrap;
  }
  .sqlite-sql-panel {
    grid-template-rows: auto 320px minmax(180px, 1fr);
  }
  .sqlite-welcome__actions {
    flex-direction: column;
  }
  .sqlite-welcome__actions button {
    justify-content: center;
  }
}
</style>
