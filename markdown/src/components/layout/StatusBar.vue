<script setup lang="ts">
import { computed } from "vue";
import { FileText, LockKeyhole, LockKeyholeOpen, ShieldCheck } from "@lucide/vue";
import { useWorkspaceStore } from "@/stores/workspace";

const store = useWorkspaceStore();

const characterCount = computed(
  () => Array.from(store.activeContent.replace(/\s/gu, "")).length,
);

const documentPath = computed(
  () => store.activePath || "当前未打开 Markdown 文档",
);

const documentPathSegments = computed(() => documentPath.value.split("/"));

const privacyLabel = computed(() =>
  store.isDemo ? "示例内容仅在当前页面处理" : "文件内容仅在本地处理",
);

const lockLabel = computed(() =>
  store.isActiveDocumentLocked ? "解锁当前文档" : "锁定当前文档",
);
</script>

<template>
  <footer class="statusbar" aria-label="当前文档状态">
    <div class="statusbar__group">
      <span
        class="statusbar__item min-w-0 max-w-[48vw]"
        :title="documentPath"
      >
        <FileText :size="13" class="shrink-0" aria-hidden="true" />
        <span class="truncate">
          <span
            v-for="(segment, index) in documentPathSegments"
            :key="`${segment}-${index}`"
          >
            <span>{{ segment }}</span>
            <span
              v-if="index < documentPathSegments.length - 1"
              class="statusbar__path-separator"
              aria-hidden="true"
            >/</span>
          </span>
        </span>
      </span>
    </div>

    <div class="statusbar__group">
      <span class="statusbar__item" :aria-label="`字数 ${characterCount}`">
        {{ characterCount }} 字
      </span>
      <span
        class="statusbar__item"
        :aria-label="`第 ${store.cursorLine} 行，第 ${store.cursorColumn} 列`"
      >
        行 {{ store.cursorLine }}，列 {{ store.cursorColumn }}
      </span>
      <button
        class="statusbar__lock-button"
        :class="{ 'statusbar__lock-button--locked': store.isActiveDocumentLocked }"
        type="button"
        :title="lockLabel"
        :aria-label="lockLabel"
        :aria-pressed="store.isActiveDocumentLocked"
        :disabled="!store.activePath || store.saveState === 'saving'"
        @click="void store.toggleActiveDocumentLock()"
      >
        <LockKeyhole
          v-if="store.isActiveDocumentLocked"
          :size="14"
          aria-hidden="true"
        />
        <LockKeyholeOpen v-else :size="14" aria-hidden="true" />
      </button>
      <span
        class="statusbar__item statusbar__privacy"
        :title="privacyLabel"
      >
        <ShieldCheck :size="13" aria-hidden="true" />
        <span>{{ store.isDemo ? "仅当前页面" : "仅本地处理" }}</span>
      </span>
    </div>
  </footer>
</template>
