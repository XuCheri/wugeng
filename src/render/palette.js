// 《五更天》色板 —— 全游戏只允许使用这些颜色（PLAN §2.1）
export const PAPER = '#EFE6D2';        // 宣纸
export const PAPER_SHADE = '#E0D2B4';  // 宣纸阴影
export const INK = '#1C1A17';          // 浓墨
export const VERM = '#C23B26';         // 朱红
export const VERM_DARK = '#8E2A1B';    // 深朱
export const LANTERN = '#F0BE62';      // 灯笼暖光（只用于玩家灯笼光圈与魂火）

// RGB 分量（生成纹理 / 渐变用）
export const RGB = {
  paper: [239, 230, 210],
  paperShade: [224, 210, 180],
  ink: [28, 26, 23],
  verm: [194, 59, 38],
  vermDark: [142, 42, 27],
  lantern: [240, 190, 98],
};

/** 淡墨：浓墨 + 透明度 */
export function inkA(a) {
  return `rgba(28,26,23,${a})`;
}
export function paperA(a) {
  return `rgba(239,230,210,${a})`;
}
export function vermA(a) {
  return `rgba(194,59,38,${a})`;
}
export function lanternA(a) {
  return `rgba(240,190,98,${a})`;
}
export function vermDarkA(a) {
  return `rgba(142,42,27,${a})`;
}
export function paperShadeA(a) {
  return `rgba(224,210,180,${a})`;
}

/** 中文字体栈（UI 工程师会以 WenKai 之名加载霞鹜文楷） */
export const FONT_CN = '"WenKai", "LXGW WenKai", "Noto Serif CJK SC", "Droid Sans Fallback", "Songti SC", serif';
