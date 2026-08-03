import type { InjectionKey, Ref } from 'vue';

export const ACTIVE_TREE_PATH = Symbol('markdown-active-tree-path') as InjectionKey<Ref<string>>;
export const EXPANDED_TREE_PATHS = Symbol('markdown-expanded-tree-paths') as InjectionKey<
  Ref<Set<string>>
>;
