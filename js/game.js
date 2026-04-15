import {
  TABLE_WIDTH,
  TABLE_HEIGHT,
  TABLE_PADDING,
  POCKETS
} from "./constants.js";
import { initBalls, drawBalls } from "./balls.js";
import {
  updateBalls,
  handleWallCollisions,
  handleBallCollisions,
  checkPockets
} from "./physics.js";
import { initCue } from "./cue.js";

/**
 * 第四阶段：
 * 1. 获取 canvas 和 context
 * 2. 设置 canvas 尺寸
 * 3. 初始化球
 * 4. 初始化球杆系统
 * 5. 启动 requestAnimationFrame 主循环
 */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// 设置 canvas 尺寸
canvas.width = TABLE_WIDTH;
canvas.height = TABLE_HEIGHT;

// 初始化球
const balls = initBalls();

// 初始化球杆系统
const { drawCue } = initCue(canvas, ctx, balls);

/**
 * 绘制球桌外框（库边）
 */
function drawRails() {
  ctx.fillStyle = "#4a2f1b";
  ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
}

/**
 * 绘制绿色台面
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
 * 渲染球桌和所有球
 */
function render() {
  ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

  drawRails();
  drawCloth();
  drawInnerBorder();
  drawPockets();
  drawBalls(ctx, balls);
  drawCue();
}

/**
 * 主循环
 */
function gameLoop() {
  // 1. 更新球的位置和速度
  updateBalls(balls);

  // 2. 处理每颗球与库边碰撞
  balls.forEach((ball) => {
    handleWallCollisions(ball);
  });

  // 3. 处理球与球碰撞
  handleBallCollisions(balls);

  // 4. 检测进袋
  checkPockets(balls);

  // 5. 重绘
  render();

  requestAnimationFrame(gameLoop);
}

// 启动
render();
requestAnimationFrame(gameLoop);
