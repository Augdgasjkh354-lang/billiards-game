import {
  TABLE_WIDTH,
  TABLE_HEIGHT,
  TABLE_PADDING,
  POCKETS
} from "./constants.js";
import { initBalls, drawBalls } from "./balls.js";

/**
 * 第二阶段：
 * 1. 获取 canvas 和 context
 * 2. 设置 canvas 尺寸
 * 3. 绘制静态球桌
 * 4. 初始化球
 * 5. 绘制球
 */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// 从 constants.js 读取球桌尺寸并设置 canvas 大小
canvas.width = TABLE_WIDTH;
canvas.height = TABLE_HEIGHT;

// 初始化球
const balls = initBalls();

/**
 * 绘制球桌外框（库边）
 */
function drawRails() {
  ctx.fillStyle = "#4a2f1b";
  ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
}

/**
 * 绘制台面
 */
function drawCloth() {
  ctx.fillStyle = "#1f8b4c";
  ctx.fillRect(
    TABLE_PADDING,
    TABLE_PADDING,
    TABLE_WIDTH - TABLE_PADDING * 2,
    TABLE_HEIGHT - TABLE_PADDING * 2
  );
}

/**
 * 绘制袋口
 */
function drawPockets() {
  ctx.fillStyle = "#000000";

  POCKETS.forEach((pocket) => {
    ctx.beginPath();
    ctx.arc(pocket.x, pocket.y, pocket.radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * 绘制台面内部边线
 */
function drawInnerBorder() {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 2;
  ctx.strokeRect(
    TABLE_PADDING,
    TABLE_PADDING,
    TABLE_WIDTH - TABLE_PADDING * 2,
    TABLE_HEIGHT - TABLE_PADDING * 2
  );
}

/**
 * 主渲染函数
 */
function render() {
  ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

  drawRails();
  drawCloth();
  drawInnerBorder();
  drawPockets();
  drawBalls(ctx, balls);
}

// 第二阶段依然是静态画面，只渲染一次
render();
