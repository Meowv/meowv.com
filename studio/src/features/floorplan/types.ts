export type Point = [number, number];
export type Wall = [number, number, number, number, 'b' | 'e' | 'n' | 'low'];
export type Rect = [number, number, number, number];
export interface Room {
  id: string;
  name: string;
  poly: Point[];
  mat: string;
  at?: Point;
  counted?: boolean;
}
export interface Door {
  name: string;
  rect: Rect;
  h: Point;
  c: Point;
  o: Point;
  len: number;
  entry?: boolean;
}
export interface Furniture {
  id: string;
  type: string;
  name: string;
  cx: number;
  cy: number;
  w: number;
  d: number;
  rot: number;
  color: string;
}
export interface PlanState {
  furniture: Furniture[];
  rooms: Record<string, { name: string; mat: string }>;
  demolished: string[];
  measures: { a: Point; b: Point }[];
}
export type Selection = { kind: 'furn' | 'room'; id: string } | null;
export type Tool = 'select' | 'measure' | 'demolish';
export interface Layers {
  dims: boolean;
  labels: boolean;
  furn: boolean;
  grid: boolean;
  bearing: boolean;
  wallSnap: boolean;
}
export type LibraryItem = [string, string, number, number, string];
export interface PlanDocument {
  schemaVersion: 1;
  templateId: 'original-apartment';
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  state: PlanState;
}
export interface Viewport {
  x0: number;
  y0: number;
  s: number;
}
export interface SceneOptions {
  cut: number;
  furn: boolean;
  labels: boolean;
  night: boolean;
  hour: number;
  mode: 'orbit' | 'walk';
}
export interface SceneBridge {
  getState(): PlanState;
  getSelection(): Selection;
  getViewport(): Viewport;
  select(value: Selection): void;
  beginEdit(): void;
  previewFurniture(id: string, patch: Partial<Furniture>): void;
  finishEdit(cancel?: boolean): void;
  snapMove(furniture: Furniture, x: number, y: number, scale: number): Point;
  notify(message: string): void;
  onMode(mode: 'orbit' | 'walk'): void;
}
export interface FloorplanScene {
  update(): void;
  setOptions(options: Partial<SceneOptions>): void;
  focusRoom(id?: string): void;
  topView(): void;
  groundAt(x: number, y: number): { x: number; y: number; s: number } | null;
  exportPng(): Promise<Blob>;
  dispose(): void;
}
