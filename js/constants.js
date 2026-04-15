/**
 * 游戏常量定义
 */

// 球桌尺寸
export const TABLE_WIDTH = 854;
export const TABLE_HEIGHT = 480;

// 球桌内边距（库边宽度）
export const TABLE_PADDING = 50;

// 球半径
export const BALL_RADIUS = 12;

// 袋口半径
export const POCKET_RADIUS = 18;

// 6 个袋口坐标
// 四个角袋 + 上下中袋
export const POCKETS = [
  { x: TABLE_PADDING, y: TABLE_PADDING, radius: POCKET_RADIUS }, // 左上
  { x: TABLE_WIDTH / 2, y: TABLE_PADDING, radius: POCKET_RADIUS * 0.85 }, // 上中
  { x: TABLE_WIDTH - TABLE_PADDING, y: TABLE_PADDING, radius: POCKET_RADIUS }, // 右上

  { x: TABLE_PADDING, y: TABLE_HEIGHT - TABLE_PADDING, radius: POCKET_RADIUS }, // 左下
  { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT - TABLE_PADDING, radius: POCKET_RADIUS * 0.85 }, // 下中
  { x: TABLE_WIDTH - TABLE_PADDING, y: TABLE_HEIGHT - TABLE_PADDING, radius: POCKET_RADIUS } // 右下
];

// 球颜色数组
// 1-7 纯色，8 黑色，9-15 花色暂时仍使用纯色占位
export const BALL_COLORS = [
  "#f4f4f4", // 0号位占位，不使用
  "#f1c40f", // 1 黄
  "#2980b9", // 2 蓝
  "#e74c3c", // 3 红
  "#8e44ad", // 4 紫
  "#e67e22", // 5 橙
  "#27ae60", // 6 绿
  "#8b0000", // 7 深红 / 棕
  "#000000", // 8 黑
  "#f1c40f", // 9 花色占位
  "#2980b9", // 10 花色占位
  "#e74c3c", // 11 花色占位
  "#8e44ad", // 12 花色占位
  "#e67e22", // 13 花色占位
  "#27ae60", // 14 花色占位
  "#8b0000" // 15 花色占位
];

// 物理常量
export const FRICTION = 0.985;
export const MIN_VELOCITY = 0.1;
