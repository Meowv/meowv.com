export type UnitFamily = 'length' | 'weight' | 'temperature' | 'area' | 'volume' | 'speed';

export interface UnitDefinition {
  id: string;
  label: string;
  factor?: number;
}

export const unitFamilies: Record<UnitFamily, UnitDefinition[]> = {
  length: [
    { id: 'mm', label: '毫米 (mm)', factor: 0.001 },
    { id: 'cm', label: '厘米 (cm)', factor: 0.01 },
    { id: 'm', label: '米 (m)', factor: 1 },
    { id: 'km', label: '千米 (km)', factor: 1000 },
    { id: 'in', label: '英寸 (in)', factor: 0.0254 },
    { id: 'ft', label: '英尺 (ft)', factor: 0.3048 },
    { id: 'yd', label: '码 (yd)', factor: 0.9144 },
    { id: 'mi', label: '英里 (mi)', factor: 1609.344 },
  ],
  weight: [
    { id: 'mg', label: '毫克 (mg)', factor: 0.000001 },
    { id: 'g', label: '克 (g)', factor: 0.001 },
    { id: 'kg', label: '千克 (kg)', factor: 1 },
    { id: 't', label: '吨 (t)', factor: 1000 },
    { id: 'oz', label: '盎司 (oz)', factor: 0.028349523125 },
    { id: 'lb', label: '磅 (lb)', factor: 0.45359237 },
  ],
  temperature: [
    { id: 'c', label: '摄氏度 (°C)' },
    { id: 'f', label: '华氏度 (°F)' },
    { id: 'k', label: '开尔文 (K)' },
  ],
  area: [
    { id: 'mm2', label: '平方毫米', factor: 0.000001 },
    { id: 'cm2', label: '平方厘米', factor: 0.0001 },
    { id: 'm2', label: '平方米', factor: 1 },
    { id: 'km2', label: '平方千米', factor: 1_000_000 },
    { id: 'ha', label: '公顷', factor: 10_000 },
    { id: 'acre', label: '英亩', factor: 4046.8564224 },
    { id: 'ft2', label: '平方英尺', factor: 0.09290304 },
  ],
  volume: [
    { id: 'ml', label: '毫升 (mL)', factor: 0.001 },
    { id: 'l', label: '升 (L)', factor: 1 },
    { id: 'm3', label: '立方米 (m³)', factor: 1000 },
    { id: 'tsp', label: '茶匙', factor: 0.00492892159375 },
    { id: 'tbsp', label: '汤匙', factor: 0.01478676478125 },
    { id: 'cup', label: '美制杯', factor: 0.2365882365 },
    { id: 'gal', label: '美制加仑', factor: 3.785411784 },
  ],
  speed: [
    { id: 'ms', label: '米/秒 (m/s)', factor: 1 },
    { id: 'kmh', label: '千米/时 (km/h)', factor: 1 / 3.6 },
    { id: 'mph', label: '英里/时 (mph)', factor: 0.44704 },
    { id: 'knot', label: '节 (kn)', factor: 0.5144444444 },
    { id: 'fts', label: '英尺/秒 (ft/s)', factor: 0.3048 },
  ],
};

export function convertUnit(family: UnitFamily, value: number, from: string, to: string): number {
  if (!Number.isFinite(value)) throw new Error('请输入有效数字。');
  if (family === 'temperature') {
    const celsius = from === 'c' ? value : from === 'f' ? ((value - 32) * 5) / 9 : value - 273.15;
    const result = to === 'c' ? celsius : to === 'f' ? (celsius * 9) / 5 + 32 : celsius + 273.15;
    if (to === 'k' && result < 0) throw new Error('温度不能低于绝对零度。');
    return result;
  }
  const definitions = unitFamilies[family];
  const source = definitions.find((unit) => unit.id === from);
  const target = definitions.find((unit) => unit.id === to);
  if (!source?.factor || !target?.factor) throw new Error('单位配置无效。');
  return (value * source.factor) / target.factor;
}
