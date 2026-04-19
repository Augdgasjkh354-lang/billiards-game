import {
  TABLE_WIDTH,
  TABLE_HEIGHT,
  TABLE_PADDING,
  POCKETS
} from "./constants.js";
import {
  initBalls,
  drawBalls,
  updatePocketingAnimations,
  triggerPocketAnimation
} from "./balls.js";
import {
  updateBalls,
  handleWallCollisions,
  handleBallCollisions,
  checkPockets
} from "./physics.js";
import { initCue } from "./cue.js";
import { initRules, processTurn, getGameState } from "./rules.js";

/**
 * 当前功能概览：
 * - 开始界面模式选择
 * - 犯规后自由球手摆
 * - 游戏结束遮罩 + 重开
 * - 练习模式顶部统计
 */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = TABLE_WIDTH;
canvas.height = TABLE_HEIGHT;

// 复用同一个 balls 数组，避免重新绑定事件
const balls = [];

// 球杆系统初始化一次
const cueController = initCue(canvas, ctx, balls);

// UI 节点
const topPanel = document.querySelector(".top-ui .ui-panel");

// 当前模式 / 游戏状态
let currentMode = null;
let gameStarted = false;
let gameWinner = null;
let uiMessage = "请选择模式开始。";

// 本杆状态采集
let wasMovingLastFrame = false;
let turnPocketedIds = [];
let turnCueBallPocketed = false;
let turnFirstHitBallId = null;

// 游戏结束按钮区域（canvas 内）
let restartButtonRect = null;

/**
 * 创建开始界面
 */
function createStartOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "startOverlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.display = "flex";
  overlay.style.flexDirection = "column";
  overlay.style.justifyContent = "center";
  overlay.style.alignItems = "center";
  overlay.style.gap = "16px";
  overlay.style.background = "rgba(0, 0, 0, 0.78)";
  overlay.style.zIndex = "1000";

  const title = document.createElement("div");
  title.textContent = "选择游戏模式";
  title.style.color = "#ffffff";
  title.style.fontSize = "32px";
  title.style.fontWeight = "700";
  title.style.marginBottom = "8px";

  const mode8Button = document.createElement("button");
  mode8Button.textContent = "中式黑八";
  mode8Button.style.padding = "14px 32px";
  mode8Button.style.fontSize = "18px";
  mode8Button.style.cursor = "pointer";
  mode8Button.style.borderRadius = "10px";
  mode8Button.style.border = "none";

  const practiceButton = document.createElement("button");
  practiceButton.textContent = "单人练习";
  practiceButton.style.padding = "14px 32px";
  practiceButton.style.fontSize = "18px";
  practiceButton.style.cursor = "pointer";
  practiceButton.style.borderRadius = "10px";
  practiceButton.style.border = "none";

  mode8Button.addEventListener("click", () => {
    overlay.style.display = "none";
    startGame("8ball");
  });

  practiceButton.addEventListener("click", () => {
    overlay.style.display = "none";
    startGame("practice");
  });

  overlay.appendChild(title);
  overlay.appendChild(mode8Button);
  overlay.appendChild(practiceButton);
  document.body.appendChild(overlay);

  return overlay;
}

const startOverlay = createStartOverlay();

/**
 * 获取事件在 canvas 中的坐标
 * @param {MouseEvent | TouchEvent} event
 * @returns {{ x: number, y: number } | null}
 */
function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();

  let clientX;
  let clientY;

  if (event.touches && event.touches.length > 0) {
    clientX = event.touches[0].clientX;
    clientY = event.touches[0].clientY;
  } else if (event.changedTouches && event.changedTouches.length > 0) {
    clientX = event.changedTouches[0].clientX;
    clientY = event.changedTouches[0].clientY;
  } else if ("clientX" in event && "clientY" in event) {
    clientX = event.clientX;
    clientY = event.clientY;
  } else {
    return null;
  }

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

/**
 * 判断点是否在矩形内
 * @param {{x:number,y:number}} point
 * @param {{x:number,y:number,width:number,height:number} | null} rect
 * @returns {boolean}
 */
function isPointInRect(point, rect) {
  if (!rect) {
    return false;
  }

  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/**
 * 获取与球最近的袋口
 * @param {object} ball
 * @returns {{ x:number, y:number, radius:number }}
 */
function findNearestPocket(ball) {
  let nearestPocket = POCKETS[0];
  let nearestDistance = Infinity;

  POCKETS.forEach((pocket) => {
    const dx = ball.x - pocket.x;
    const dy = ball.y - pocket.y;
    const distance = Math.hypot(dx, dy);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestPocket = pocket;
    }
  });

  return nearestPocket;
}

/**
 * 重置本杆采集数据
 */
function resetTurnTracking() {
  turnPocketedIds = [];
  turnCueBallPocketed = false;
  turnFirstHitBallId = null;
}

/**
 * 初始化 / 重开一局
 * @param {'8ball' | 'practice'} mode
 */
function startGame(mode) {
  currentMode = mode;
  gameStarted = true;
  gameWinner = null;
  restartButtonRect = null;

  balls.length = 0;
  balls.push(...initBalls());

  initRules(mode);
  uiMessage = getGameState().lastMessage;

  wasMovingLastFrame = false;
  resetTurnTracking();

  cueController.reset();
  cueController.setInteractionEnabled(true);

  render();
}

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
 * 获取剩余的全色/花色球数量
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
 * 获取练习模式当前已进袋数量
 * 不统计母球
 * @returns {number}
 */
function getPracticePocketedCount() {
  return balls.filter((ball) => ball.id !== 0 && ball.isPocketed).length;
}

/**
 * 记录本杆第一颗被母球击中的球
 * 当前使用接触检测近似记录
 */
function detectFirstHitBall() {
  if (turnFirstHitBallId != null) {
    return;
  }

  const cueBall = balls.find((ball) => ball.id === 0);
  if (!cueBall || cueBall.isPocketed) {
    return;
  }

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
 * 绘制圆角矩形
 */
function drawRoundedRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * 在一杆结束时结算规则
 */
function finalizeTurn() {
  if (!gameStarted || gameWinner != null) {
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
    cueController.setInteractionEnabled(false);
    resetTurnTracking();
    return;
  }

  if (currentMode === "8ball" && result.foul) {
    cueController.activateBallInHand();
    uiMessage += " 请在厨房区手摆母球后继续击球。";
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

  if (!gameStarted) {
    topPanel.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:8px; align-items:center;">
        <div style="font-size:18px; color:#ffffff;">纯前端台球游戏</div>
        <div style="font-size:14px; color:#cfcfcf;">请选择模式开始</div>
      </div>
    `;
    return;
  }

  const state = getGameState();

  if (currentMode === "practice") {
    topPanel.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:8px; align-items:center;">
        <div style="font-size:18px; color:#ffffff;">单人练习</div>
        <div style="font-size:14px; color:#cfcfcf;">本局进袋数：${getPracticePocketedCount()}</div>
        <div style="font-size:14px; color:#ffd166;">${uiMessage}</div>
      </div>
    `;
    return;
  }

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
        ${gameWinner ? `玩家 ${gameWinner} 获胜` : `当前玩家：玩家 ${state.currentPlayer}`}
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
 * 绘制球桌外框（库边）— 木纹渐变
 */
function drawRails() {
  ctx.save();

  // 底层木色渐变
  const railGrad = ctx.createLinearGradient(0, 0, 0, TABLE_HEIGHT);
  railGrad.addColorStop(0, "#5c3a1e");
  railGrad.addColorStop(0.3, "#4a2f1b");
  railGrad.addColorStop(0.7, "#3d2412");
  railGrad.addColorStop(1, "#4a2f1b");
  ctx.fillStyle = railGrad;
  ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

  // 水平木纹条纹
  for (let y = 0; y < TABLE_HEIGHT; y += 6) {
    const alpha = 0.025 + Math.abs(Math.sin(y * 0.65)) * 0.018;
    ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
    ctx.fillRect(0, y, TABLE_WIDTH, 2);
  }

  // 内侧四边高光（模拟库边与台面交接处）
  const edgeHighlight = ctx.createLinearGradient(TABLE_PADDING - 6, 0, TABLE_PADDING, 0);
  edgeHighlight.addColorStop(0, "rgba(255,255,255,0)");
  edgeHighlight.addColorStop(1, "rgba(255,255,255,0.1)");
  ctx.fillStyle = edgeHighlight;
  ctx.fillRect(TABLE_PADDING - 6, TABLE_PADDING, 6, TABLE_HEIGHT - TABLE_PADDING * 2);

  const edgeHighlightR = ctx.createLinearGradient(TABLE_WIDTH - TABLE_PADDING, 0, TABLE_WIDTH - TABLE_PADDING + 6, 0);
  edgeHighlightR.addColorStop(0, "rgba(255,255,255,0.1)");
  edgeHighlightR.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = edgeHighlightR;
  ctx.fillRect(TABLE_WIDTH - TABLE_PADDING, TABLE_PADDING, 6, TABLE_HEIGHT - TABLE_PADDING * 2);

  // 外框深色边线
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, TABLE_WIDTH - 4, TABLE_HEIGHT - 4);

  ctx.restore();
}

/**
 * 绘制台面 — 径向渐变 + 斜向织物纹路
 */
function drawCloth() {
  const cX = TABLE_PADDING;
  const cY = TABLE_PADDING;
  const cW = TABLE_WIDTH - TABLE_PADDING * 2;
  const cH = TABLE_HEIGHT - TABLE_PADDING * 2;

  // 径向渐变：中心略亮，边缘暗（灯光效果）
  const feltGrad = ctx.createRadialGradient(
    TABLE_WIDTH / 2, TABLE_HEIGHT / 2, 0,
    TABLE_WIDTH / 2, TABLE_HEIGHT / 2, Math.max(cW, cH) * 0.72
  );
  feltGrad.addColorStop(0, "#22964f");
  feltGrad.addColorStop(0.5, "#1f8b4c");
  feltGrad.addColorStop(1, "#165f35");
  ctx.fillStyle = feltGrad;
  ctx.fillRect(cX, cY, cW, cH);

  // 斜向织物纹路
  ctx.save();
  ctx.beginPath();
  ctx.rect(cX, cY, cW, cH);
  ctx.clip();
  ctx.strokeStyle = "rgba(0,0,0,0.04)";
  ctx.lineWidth = 1;
  for (let x = cX - cH; x < cX + cW + cH; x += 9) {
    ctx.beginPath();
    ctx.moveTo(x, cY);
    ctx.lineTo(x + cH, cY + cH);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 绘制单个菱形瞄准标记
 */
function drawDiamond(x, y, size, color) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size * 0.62, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size * 0.62, y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(160, 120, 50, 0.5)";
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.restore();
}

/**
 * 绘制库边瞄准点（菱形标记）
 */
function drawDiamondMarkers() {
  const innerW = TABLE_WIDTH - TABLE_PADDING * 2;
  const innerH = TABLE_HEIGHT - TABLE_PADDING * 2;
  const color = "rgba(235, 210, 120, 0.82)";
  const size = 4.5;

  // 长边：8 等分，跳过距袋口过近的位置
  for (let i = 1; i <= 7; i++) {
    const x = TABLE_PADDING + (innerW / 8) * i;
    if (Math.abs(x - TABLE_WIDTH / 2) < 12) continue;

    const yTop = TABLE_PADDING / 2;
    const yBot = TABLE_HEIGHT - TABLE_PADDING / 2;
    drawDiamond(x, yTop, size, color);
    drawDiamond(x, yBot, size, color);
  }

  // 短边：4 等分
  for (let i = 1; i <= 3; i++) {
    const y = TABLE_PADDING + (innerH / 4) * i;
    const xLeft = TABLE_PADDING / 2;
    const xRight = TABLE_WIDTH - TABLE_PADDING / 2;
    drawDiamond(xLeft, y, size, color);
    drawDiamond(xRight, y, size, color);
  }
}

/**
 * 绘制袋口 — 3层：皮革环 + 深洞渐变 + 边缘高光
 */
function drawPockets() {
  POCKETS.forEach((pocket) => {
    const r = pocket.radius;
    const { x, y } = pocket;

    ctx.save();

    // 皮革外环
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = "#2e1608";
    ctx.fill();

    // 深黑洞
    const holeGrad = ctx.createRadialGradient(
      x - r * 0.25, y - r * 0.25, 0,
      x, y, r
    );
    holeGrad.addColorStop(0, "#1a1a1a");
    holeGrad.addColorStop(0.55, "#080808");
    holeGrad.addColorStop(1, "#000000");
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = holeGrad;
    ctx.fill();

    // 皮革边缘高光描边
    const rimGrad = ctx.createLinearGradient(x - r, y - r, x + r * 0.5, y + r * 0.5);
    rimGrad.addColorStop(0, "rgba(130, 75, 25, 0.75)");
    rimGrad.addColorStop(0.5, "rgba(80, 40, 10, 0.35)");
    rimGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = rimGrad;
    ctx.stroke();

    ctx.restore();
  });
}

/**
 * 绘制台面内部边线 — 暖色库边线
 */
function drawInnerBorder() {
  ctx.strokeStyle = "rgba(160, 110, 50, 0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(
    TABLE_PADDING,
    TABLE_PADDING,
    TABLE_WIDTH - TABLE_PADDING * 2,
    TABLE_HEIGHT - TABLE_PADDING * 2
  );
}

/**
 * 绘制游戏结束遮罩
 */
function drawGameOverOverlay() {
  if (gameWinner == null) {
    restartButtonRect = null;
    return;
  }

  ctx.save();

  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 42px Arial";
  ctx.fillText(`玩家 ${gameWinner} 获胜`, TABLE_WIDTH / 2, TABLE_HEIGHT / 2 - 40);

  const buttonWidth = 180;
  const buttonHeight = 54;
  const buttonX = TABLE_WIDTH / 2 - buttonWidth / 2;
  const buttonY = TABLE_HEIGHT / 2 + 20;

  restartButtonRect = {
    x: buttonX,
    y: buttonY,
    width: buttonWidth,
    height: buttonHeight
  };

  drawRoundedRect(buttonX, buttonY, buttonWidth, buttonHeight, 12);
  ctx.fillStyle = "#f1f1f1";
  ctx.fill();

  ctx.fillStyle = "#111111";
  ctx.font = "bold 24px Arial";
  ctx.fillText("重新开始", TABLE_WIDTH / 2, buttonY + buttonHeight / 2);

  ctx.restore();
}

/**
 * 渲染球桌和球
 */
function render() {
  ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

  drawRails();
  drawCloth();
  drawDiamondMarkers();
  drawInnerBorder();
  drawPockets();

  if (balls.length > 0) {
    drawBalls(ctx, balls);
    cueController.drawCue();
  }

  drawGameOverOverlay();
  updateTopUI();
}

/**
 * 处理 canvas 上的“重新开始”点击
 * @param {MouseEvent | TouchEvent} event
 */
function handleRestartPointer(event) {
  if (gameWinner == null || currentMode == null) {
    return;
  }

  const point = getCanvasPoint(event);
  if (!point) {
    return;
  }

  if (isPointInRect(point, restartButtonRect)) {
    startGame(currentMode);
  }
}

canvas.addEventListener("click", handleRestartPointer);
canvas.addEventListener(
  "touchend",
  (event) => {
    if (gameWinner == null) {
      return;
    }

    event.preventDefault();
    handleRestartPointer(event);
  },
  { passive: false }
);

/**
 * 主循环
 */
function gameLoop() {
  if (gameStarted && gameWinner == null) {
    const isMovingBeforeUpdate = !areAllBallsStopped();

    if (!wasMovingLastFrame && isMovingBeforeUpdate) {
      resetTurnTracking();
    }

    updateBalls(balls);

    balls.forEach((ball) => {
      handleWallCollisions(ball);
    });

    detectFirstHitBall();
    handleBallCollisions(balls);

    const pocketedThisFrame = checkPockets(balls);

    if (pocketedThisFrame.length > 0) {
      pocketedThisFrame.forEach((id) => {
        turnPocketedIds.push(id);

        if (id === 0) {
          turnCueBallPocketed = true;
          return;
        }

        const ball = balls.find((item) => item.id === id);

        if (ball && ball.isPocketed) {
          const pocket = findNearestPocket(ball);
          triggerPocketAnimation(ball, pocket.x, pocket.y);
        }
      });
    }

    updatePocketingAnimations();

    const isMovingAfterUpdate = !areAllBallsStopped();

    if (wasMovingLastFrame && !isMovingAfterUpdate) {
      finalizeTurn();
    }

    wasMovingLastFrame = isMovingAfterUpdate;
  } else {
    updatePocketingAnimations();
  }

  render();
  requestAnimationFrame(gameLoop);
}

// 初始状态
cueController.setInteractionEnabled(false);
updateTopUI();
render();
requestAnimationFrame(gameLoop);
