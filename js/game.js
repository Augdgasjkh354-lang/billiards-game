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
import { initRules, processTurn, getGameState } from "./rules.js";

/**
 * 第五阶段：
 * 1. 初始化球桌 / 球 / 球杆 / 规则
 * 2. 在每杆开始到结束之间记录：
 *    - 本杆进袋球
 *    - 母球是否进袋
 *    - 第一颗击中的球
 * 3. 球停稳后自动结算回合
 */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// 设置 canvas 尺寸
canvas.width = TABLE_WIDTH;
canvas.height = TABLE_HEIGHT;

// 初始化球
const balls = initBalls();

// 初始化规则（可切换为 'practice'）
initRules("8ball");

// 初始化球杆系统
const { drawCue } = initCue(canvas, ctx, balls);

// UI 节点
const topPanel = document.querySelector(".top-ui .ui-panel");

// 游戏结算文案
let uiMessage = getGameState().lastMessage;

// 本杆状态采集
let wasMovingLastFrame = false;
let turnPocketedIds = [];
let turnCueBallPocketed = false;
let turnFirstHitBallId = null;
let gameWinner = null;

/**
 * 判断所有球是否静止
 * @returns {boolean}
 */
function areAllBallsStopped() {
  return balls.every((ball) => {
    if (ball.isPocketed) {
      return true;
    }

    return Math.hypot(ball.vx, ball.vy) < 0.01;
  });
}

/**
 * 获取剩余的全色/花色球数量（不含 8 号球）
 * @returns {{ solid: number, stripe: number }}
 */
function getRemainingCounts() {
  let solid = 0;
  let stripe = 0;

  balls.forEach((ball) => {
    if (ball.isPocketed) {
      return;
    }

    if (ball.id >= 1 && ball.id <= 7) {
      solid += 1;
    } else if (ball.id >= 9 && ball.id <= 15) {
      stripe += 1;
    }
  });

  return { solid, stripe };
}

/**
 * 记录本杆第一颗被母球击中的球
 *
 * 由于当前 physics.js 没有直接返回碰撞事件，
 * 这里在球碰撞处理前，基于“母球与目标球是否接触”来捕捉第一碰。
 */
function detectFirstHitBall() {
  if (turnFirstHitBallId != null) {
    return;
  }

  const cueBall = balls.find((ball) => ball.id === 0);
  if (!cueBall || cueBall.isPocketed) {
    return;
  }

  // 只有母球正在运动时才检测
  if (Math.hypot(cueBall.vx, cueBall.vy) < 0.01) {
    return;
  }

  let nearestBallId = null;
  let nearestDistance = Infinity;

  balls.forEach((ball) => {
    if (ball.id === 0 || ball.isPocketed) {
      return;
    }

    const dx = ball.x - cueBall.x;
    const dy = ball.y - cueBall.y;
    const distance = Math.hypot(dx, dy);
    const collisionDistance = cueBall.radius + ball.radius;

    if (distance <= collisionDistance + 0.5 && distance < nearestDistance) {
      nearestDistance = distance;
      nearestBallId = ball.id;
    }
  });

  if (nearestBallId != null) {
    turnFirstHitBallId = nearestBallId;
  }
}

/**
 * 开始一杆时重置采集数据
 */
function resetTurnTracking() {
  turnPocketedIds = [];
  turnCueBallPocketed = false;
  turnFirstHitBallId = null;
}

/**
 * 在一杆结束时结算规则
 */
function finalizeTurn() {
  if (gameWinner != null) {
    return;
  }

  const result = processTurn(
    [...turnPocketedIds],
    turnCueBallPocketed,
    turnFirstHitBallId,
    {
      remainingCounts: getRemainingCounts()
    }
  );

  uiMessage = result.message;

  if (result.winner != null) {
    gameWinner = result.winner;
  }

  resetTurnTracking();
}

/**
 * 更新顶部 UI
 */
function updateTopUI() {
  if (!topPanel) {
    return;
  }

  const state = getGameState();

  const player1GroupText =
    state.player1Group === "solid"
      ? "全色"
      : state.player1Group === "stripe"
        ? "花色"
        : "未分组";

  const player2GroupText =
    state.player2Group === "solid"
      ? "全色"
      : state.player2Group === "stripe"
        ? "花色"
        : "未分组";

  topPanel.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:8px; align-items:center;">
      <div style="font-size:18px; color:#ffffff;">
        ${gameWinner ? `胜者：玩家 ${gameWinner}` : `当前玩家：玩家 ${state.currentPlayer}`}
      </div>
      <div style="font-size:14px; color:#cfcfcf;">
        玩家1：${player1GroupText} ｜ 玩家2：${player2GroupText}
      </div>
      <div style="font-size:14px; color:#ffd166;">
        ${uiMessage}
      </div>
    </div>
  `;
}

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
  updateTopUI();
}

/**
 * 主循环
 */
function gameLoop() {
  if (gameWinner == null) {
    const isMovingBeforeUpdate = !areAllBallsStopped();

    // 检测一杆开始：从静止 -> 运动
    if (!wasMovingLastFrame && isMovingBeforeUpdate) {
      resetTurnTracking();
    }

    // 1. 更新球的位置和速度
    updateBalls(balls);

    // 2. 处理每颗球与库边碰撞
    balls.forEach((ball) => {
      handleWallCollisions(ball);
    });

    // 3. 在真正碰撞处理前，尝试记录第一碰
    detectFirstHitBall();

    // 4. 处理球与球碰撞
    handleBallCollisions(balls);

    // 5. 检测进袋并累计本杆进袋信息
    const pocketedThisFrame = checkPockets(balls);

    if (pocketedThisFrame.length > 0) {
      pocketedThisFrame.forEach((id) => {
        turnPocketedIds.push(id);

        if (id === 0) {
          turnCueBallPocketed = true;
        }
      });
    }

    // 6. 检测一杆结束：从运动 -> 静止
    const isMovingAfterUpdate = !areAllBallsStopped();

    if (wasMovingLastFrame && !isMovingAfterUpdate) {
      finalizeTurn();
    }

    wasMovingLastFrame = isMovingAfterUpdate;
  }

  // 7. 重绘
  render();

  requestAnimationFrame(gameLoop);
}

// 启动
updateTopUI();
render();
requestAnimationFrame(gameLoop);
