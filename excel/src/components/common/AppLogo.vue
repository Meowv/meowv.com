<script setup lang="ts">
withDefaults(
  defineProps<{
    compact?: boolean;
    subtitle?: string;
    to?: string;
  }>(),
  {
    compact: false,
    subtitle: "",
    to: "/",
  },
);
</script>

<template>
  <RouterLink class="app-logo" :class="{ 'app-logo--compact': compact }" :to="to">
    <img class="app-logo__image" src="/assets/app-icon.png" alt="" width="36" height="36" />
    <span class="app-logo__copy">
      <strong class="app-logo__name">在线 Excel 处理</strong>
      <span v-if="subtitle && !compact" class="app-logo__subtitle">{{ subtitle }}</span>
    </span>
  </RouterLink>
</template>

<style scoped>
.app-logo {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  color: var(--text-strong);
  text-decoration: none;
}

.app-logo:focus-visible {
  border-radius: 6px;
  outline: 3px solid rgb(22 163 74 / 20%);
  outline-offset: 4px;
}

.app-logo__image {
  width: 39.7px;
  height: 39.7px;
  flex: 0 0 auto;
  border-radius: 7px;
}

.app-logo__copy {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.app-logo__name {
  overflow: hidden;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-logo__subtitle {
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-logo--compact {
  gap: 8px;
}

.app-logo--compact .app-logo__image {
  width: 30px;
  height: 30px;
  border-radius: 6px;
}

.app-logo--compact .app-logo__name {
  font-size: 16px;
}
</style>
