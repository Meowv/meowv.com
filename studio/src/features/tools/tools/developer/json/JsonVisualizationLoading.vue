<template>
  <div class="json-visualization-loading" role="status" aria-live="polite" aria-busy="true">
    <span class="json-visualization-loading__spinner" aria-hidden="true"></span>
    <span>JSON 可视化加载中…</span>
  </div>
</template>

<style scoped>
.json-visualization-loading {
  display: flex;
  width: 100%;
  min-height: 520px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  background: var(--color-surface-soft);
  color: var(--color-text-muted);
  font-size: 12px;
}

.json-visualization-loading__spinner {
  width: 17px;
  height: 17px;
  border: 2px solid color-mix(in srgb, var(--tools-accent) 20%, var(--color-border));
  border-top-color: var(--tools-accent);
  border-radius: 50%;
  animation: json-visualization-loading-spin 800ms linear infinite;
}

@keyframes json-visualization-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .json-visualization-loading__spinner {
    animation: none;
  }
}

@container (max-width: 760px) {
  .json-visualization-loading {
    min-height: 440px;
  }
}
</style>
