import {
  TABLE_WIDTH,
  TABLE_HEIGHT,
  TABLE_PADDING,
  BALL_RADIUS,
  BALL_COLORS
} from "./constants.js";

/**
 * 进袋动画队列
 * 每项：
 * {
 *   ball: { ...球快照 },
 *   progress: 0~1,
 *   pocketX,
 *   pocketY
 * }
 */
const pocketingAnimations = [];
const POCKET_ANIMATION_STEP = 1 / 20;

/**
 * 打乱数组顺序
 * @param {number[]} array
 * @returns {number[]}
 */
function shuffle(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

/**
 * 创建单颗球的数据结构
 * @param {number} id
 * @param {number} x
 * @param {number} y
 * @returns {object}
 */
function createBall(id, x, y) {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    omega: 0,
    spinX: 0,
    radius: BALL_RADIUS,
    color: BALL_COLORS[id],
    isStripe: id >= 9 && id <= 15,
    isPocketed: false
  };
}

/**
 * 计算三角阵中 15 颗目标球的位置
 * 顶点位于台面内部区域右侧 1/4 处，垂直居中
 *
 * @returns {Array<{row:number,col:number,x:number,y:number}>}
 */
function getRackPositions() {
  const innerWidth = TABLE_WIDTH - TABLE_PADDING * 2;
  const innerHeight = TABLE_HEIGHT - TABLE_PADDING * 2;

  const apexX = TABLE_PADDING + innerWidth * 0.75;
  const centerY = TABLE_PADDING + innerHeight / 2;

  const horizontalSpacing = Math.sqrt(3) * BALL_RADIUS;
  const verticalSpacing = BALL_RADIUS * 2;

  const positions = [];

  for (let row = 0; row < 5; row += 1) {
    const x = apexX + row * horizontalSpacing;

    for (let col = 0; col <= row; col += 1) {
      const y = centerY - row * BALL_RADIUS + col * verticalSpacing;

      positions.push({
        row,
        col,
        x,
        y
      });
    }
  }

  return positions;
}

/**
 * 初始化所有球
 * @returns {object[]}
 */
export function initBalls() {
  const balls = [];

  const innerWidth = TABLE_WIDTH - TABLE_PADDING * 2;
  const innerHeight = TABLE_HEIGHT - TABLE_PADDING * 2;
  const centerY = TABLE_PADDING + innerHeight / 2;

  // 母球：台面左侧 1/4 处，垂直居中
  const cueBallX = TABLE_PADDING + innerWidth * 0.25;
  balls.push(createBall(0, cueBallX, centerY));

  const rackPositions = getRackPositions();

  // 8 号球固定在三角阵正中间
  const centerIndex = rackPositions.findIndex(
    (pos) => pos.row === 2 && pos.col === 1
  );

  const solidIds = shuffle([1, 2, 3, 4, 5, 6, 7]);
  const stripeIds = shuffle([9, 10, 11, 12, 13, 14, 15]);

  let solidIndex = 0;
  let stripeIndex = 0;
  const startWithSolid = Math.random() < 0.5;
  let placementIndex = 0;

  rackPositions.forEach((pos, index) => {
    if (index === centerIndex) {
      balls.push(createBall(8, pos.x, pos.y));
      return;
    }

    const shouldUseSolid = startWithSolid
      ? placementIndex % 2 === 0
      : placementIndex % 2 !== 0;

    let ballId;

    if (shouldUseSolid) {
      ballId = solidIds[solidIndex];
      solidIndex += 1;
    } else {
      ballId = stripeIds[stripeIndex];
      stripeIndex += 1;
    }

    balls.push(createBall(ballId, pos.x, pos.y));
    placementIndex += 1;
  });

  return balls;
}

/**
 * 将十六进制颜色转为 RGB
 * @param {string} hex
 * @returns {{ r:number, g:number, b:number }}
 */
function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((c) => c + c).join("")
    : normalized;

  const intValue = Number.parseInt(value, 16);

  return {
    r: (intValue >> 16) & 255,
    g: (intValue >> 8) & 255,
    b: intValue & 255
  };
}

/**
 * 将颜色变暗
 * amount=0.3 表示变暗 30%
 *
 * @param {string} hex
 * @param {number} amount
 * @returns {string}
 */
function darkenColor(hex, amount = 0.3) {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 - amount;

  const nr = Math.max(0, Math.round(r * factor));
  const ng = Math.max(0, Math.round(g * factor));
  const nb = Math.max(0, Math.round(b * factor));

  return `rgb(${nr}, ${ng}, ${nb})`;
}

/**
 * 线性插值
 * @param {number} start
 * @param {number} end
 * @param {number} t
 * @returns {number}
 */
function lerp(start, end, t) {
  return start + (end - start) * t;
}

/**
 * 绘制球体基础圆
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @param {string} fillStyle
 * @param {string} strokeStyle
 */
function drawBaseSphere(ctx, x, y, radius, fillStyle, strokeStyle) {
  ctx.save();

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillStyle;
  ctx.fill();

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = strokeStyle;
  ctx.stroke();

  ctx.restore();
}

/**
 * 绘制统一高光
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @param {number} strength
 */
function drawHighlight(ctx, x, y, radius, strength = 0.85) {
  ctx.save();

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();

  const gradient = ctx.createRadialGradient(
    x - radius * 0.3,
    y - radius * 0.35,
    0,
    x - radius * 0.3,
    y - radius * 0.35,
    radius * 0.6
  );

  gradient.addColorStop(0, `rgba(255, 255, 255, ${strength})`);
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.restore();
}

/**
 * 绘制数字
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} ball
 * @param {string} fillColor
 * @param {number} yOffset
 */
function drawBallNumber(ctx, ball, fillColor, yOffset = 0) {
  ctx.save();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${ball.radius}px Arial`;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
  ctx.fillStyle = fillColor;

  ctx.strokeText(String(ball.id), ball.x, ball.y + yOffset);
  ctx.fillText(String(ball.id), ball.x, ball.y + yOffset);

  ctx.restore();
}

/**
 * 绘制纯色球（1-7）
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} ball
 */
function drawSolidBall(ctx, ball) {
  drawBaseSphere(
    ctx,
    ball.x,
    ball.y,
    ball.radius,
    ball.color,
    darkenColor(ball.color, 0.3)
  );

  drawHighlight(ctx, ball.x, ball.y, ball.radius, 0.85);
  drawBallNumber(ctx, ball, "#ffffff");
}

/**
 * 绘制花色球（9-15）
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} ball
 */
function drawStripeBall(ctx, ball) {
  const outlineColor = darkenColor(ball.color, 0.3);

  drawBaseSphere(ctx, ball.x, ball.y, ball.radius, "#ffffff", outlineColor);

  ctx.save();
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.clip();

  const stripeHeight = ball.radius;
  ctx.fillStyle = ball.color;
  ctx.fillRect(
    ball.x - ball.radius,
    ball.y - stripeHeight / 2,
    ball.radius * 2,
    stripeHeight
  );

  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = outlineColor;
  ctx.stroke();
  ctx.restore();

  drawHighlight(ctx, ball.x, ball.y, ball.radius, 0.85);
  drawBallNumber(ctx, ball, ball.color);
}

/**
 * 绘制 8 号球
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} ball
 */
function drawEightBall(ctx, ball) {
  drawBaseSphere(
    ctx,
    ball.x,
    ball.y,
    ball.radius,
    "#000000",
    "rgb(20, 20, 20)"
  );

  ctx.save();
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
  ctx.stroke();
  ctx.restore();

  drawHighlight(ctx, ball.x, ball.y, ball.radius, 0.85);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.max(10, ball.radius * 0.9)}px Arial`;
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.fillStyle = "#000000";
  ctx.strokeText("8", ball.x, ball.y);
  ctx.fillText("8", ball.x, ball.y);
  ctx.restore();
}

/**
 * 绘制母球
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} ball
 */
function drawCueBall(ctx, ball) {
  drawBaseSphere(
    ctx,
    ball.x,
    ball.y,
    ball.radius,
    "#ffffff",
    "rgb(180, 180, 180)"
  );

  drawHighlight(ctx, ball.x, ball.y, ball.radius, 0.95);
}

/**
 * 绘制单颗球
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} ball
 */
function drawBall(ctx, ball) {
  if (ball.isPocketed) {
    return;
  }

  if (ball.id === 0) {
    drawCueBall(ctx, ball);
    return;
  }

  if (ball.id === 8) {
    drawEightBall(ctx, ball);
    return;
  }

  if (ball.isStripe) {
    drawStripeBall(ctx, ball);
    return;
  }

  drawSolidBall(ctx, ball);
}

/**
 * 触发进袋动画
 * @param {object} ball
 * @param {number} pocketX
 * @param {number} pocketY
 */
export function triggerPocketAnimation(ball, pocketX, pocketY) {
  if (!ball || ball.id === 0) {
    return;
  }

  pocketingAnimations.push({
    ball: {
      ...ball,
      isPocketed: false
    },
    progress: 0,
    pocketX,
    pocketY
  });
}

/**
 * 更新进袋动画
 */
export function updatePocketingAnimations() {
  for (let i = pocketingAnimations.length - 1; i >= 0; i -= 1) {
    const animation = pocketingAnimations[i];
    animation.progress += POCKET_ANIMATION_STEP;

    if (animation.progress >= 1) {
      pocketingAnimations.splice(i, 1);
    }
  }
}

/**
 * 绘制所有球
 * - 正常未进袋球
 * - 正在播放进袋动画的球
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object[]} balls
 */
export function drawBalls(ctx, balls) {
  balls.forEach((ball) => {
    if (!ball.isPocketed) {
      drawBall(ctx, ball);
    }
  });

  pocketingAnimations.forEach((animation) => {
    const { ball, progress, pocketX, pocketY } = animation;
    const t = Math.max(0, Math.min(1, progress));
    const animatedRadius = ball.radius * (1 - t);
    const animatedAlpha = 1 - t;

    if (animatedRadius <= 0 || animatedAlpha <= 0) {
      return;
    }

    const animatedBall = {
      ...ball,
      x: lerp(ball.x, pocketX, t),
      y: lerp(ball.y, pocketY, t),
      radius: animatedRadius,
      isPocketed: false
    };

    ctx.save();
    ctx.globalAlpha = animatedAlpha;
    drawBall(ctx, animatedBall);
    ctx.restore();
  });
}
