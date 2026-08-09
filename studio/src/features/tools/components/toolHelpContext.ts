import type { InjectionKey } from 'vue';

export interface ToolHelpContent {
  title: string;
  steps: readonly string[];
  note: string;
}

export type ToolHelpRegistration = (content: ToolHelpContent | null) => void;

export const TOOL_HELP_REGISTRATION: InjectionKey<ToolHelpRegistration> = Symbol(
  'tool-help-registration',
);
