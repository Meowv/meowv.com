<script setup lang="ts">
import { computed } from 'vue';
import { IconDownload, IconX } from '@tabler/icons-vue';
import type { LivewallPromoModel } from './useLivewallPromo';

const props = defineProps<{ model: LivewallPromoModel }>();
const emit = defineEmits<{ dismiss: [] }>();

/** 平台与版本合成一个徽标，如 `Mac · v0.1.0`。 */
const badge = computed(() =>
  [props.model.cta.platformLabel, props.model.versionLabel]
    .filter((part): part is string => Boolean(part))
    .join(' · '),
);
</script>

<template>
  <!-- 右下角浮层：固定在视口右下，层级低于灯箱(30) 高于吸顶工具条(20)。 -->
  <aside class="wallpapers-app-popup" :aria-label="`${model.cta.title} App 推广`">
    <button
      class="wallpapers-app-popup__close"
      type="button"
      title="关闭"
      :aria-label="`关闭 ${model.cta.title} App 推广`"
      @click="emit('dismiss')"
    >
      <IconX :size="15" />
    </button>
    <div class="wallpapers-app-popup__head">
      <span class="wallpapers-app-popup__icon" aria-hidden="true">
        <component :is="model.icon" :size="20" stroke-width="1.8" />
      </span>
      <span class="wallpapers-app-popup__titles">
        <strong class="wallpapers-app-popup__title">{{ model.cta.title }}</strong>
        <span v-if="badge" class="wallpapers-app-popup__badge">{{ badge }}</span>
        <span v-if="model.fileSizeLabel" class="wallpapers-app-popup__size">
          {{ model.fileSizeLabel }}
        </span>
      </span>
    </div>
    <p class="wallpapers-app-popup__desc">{{ model.cta.description }}</p>
    <div class="wallpapers-app-popup__actions">
      <a
        v-if="model.downloadUrl"
        class="wallpapers-app-popup__action"
        :href="model.downloadUrl"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="`${model.cta.actionLabel} ${model.cta.title} App`"
      >
        <IconDownload :size="15" />
        <span>{{ model.cta.actionLabel }}</span>
      </a>
      <button v-else class="wallpapers-app-popup__action" type="button" disabled>
        {{ model.cta.actionLabel }}
      </button>
    </div>
  </aside>
</template>
