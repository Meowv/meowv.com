import { onBeforeUnmount, onScopeDispose } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { ResourceScope } from '@/core/browser/resource-scope';

export function useResourceScope(): ResourceScope {
  const scope = new ResourceScope();
  const dispose = () => scope.dispose();
  onScopeDispose(dispose);
  onBeforeUnmount(dispose);
  onBeforeRouteLeave(dispose);
  return scope;
}
