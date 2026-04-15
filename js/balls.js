import {
  TABLE_WIDTH,
  TABLE_HEIGHT,
  TABLE_PADDING,
  BALL_RADIUS,
  BALL_COLORS
} from "./constants.js";

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
    radius: BALL_RADIUS,
    color: BALL_COLORS[id],
    isStripe: id >= 9 && id <= 15,
    isPocketed: false
  };
}

/**
 * 计算三角阵中 15 颗目标球的位置
 * 顶点位于台面内部区域右侧 1/4 处，垂直居中。
 *
 * 行数：
 * 1
 * 2
 * 3
 * 4
 * 5
 *
 * 返回格式：
 * [
 *   { row, col, x, y },
 *   ...
 * ]
 */
function getRackPositions() {
  const innerWidth = TABLE_WIDTH - TABLE_PADDING * 2;
  const innerHeight = TABLE_HEIGHT - TABLE_PADDING * 2;

  const apexX = TABLE_PADDING + innerWidth * 0.75;
  const centerY = TABLE_PADDING + innerHeight / 2;

  // 等边三角紧密排列时，相邻两列球心的水平间距
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
 * 规则：
 * - 0 号球为母球
 * - 1~15 为目标球
 * - 8 号球固定放在三角阵正中间（第 3 行中间）
 * - 其余球随机，但按照三角阵填充顺序做“纯色 / 花色交替”
 *
 * @returns {object[]}
 */
export function initBalls() {
  const balls = [];

  // 台面内部区域
  const innerWidth = TABLE_WIDTH - TABLE_PADDING * 2;
  const innerHeight = TABLE_HEIGHT - TABLE_PADDING * 2;
  const centerY = TABLE_PADDING + innerHeight / 2;

  // 母球：台面左侧 1/4 处，垂直居中
  const cueBallX = TABLE_PADDING + innerWidth * 0.25;
  balls.push(createBall(0, cueBallX, centerY));

  // 三角阵位置
  const rackPositions = getRackPositions();

  // 中间位置固定为 8 号球：第 3 行中间（row=2, col=1）
  const centerIndex = rackPositions.findIndex(
    (pos) => pos.row === 2 && pos.col === 1
  );

  const solidIds = shuffle([1, 2, 3, 4, 5, 6, 7]);
  const stripeIds = shuffle([9, 10, 11, 12, 13, 14, 15]);

  let solidIndex = 0;
  let stripeIndex = 0;

  // 随机决定三角阵第一个位置从纯色还是花色开始
  const startWithSolid = Math.random() < 0.5;

  let placementIndex = 0;

  rackPositions.forEach((pos, index) => {
    // 中间固定放 8 号球
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
 * 绘制球上的数字
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} ball
 */
function drawBallNumber(ctx, ball) {
  ctx.save();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.max(12, ball.radius)}px Arial`;

  // 先描边再填充，保证浅色球也能看清数字
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  ctx.strokeText(String(ball.id), ball.x, ball.y);

  ctx.fillStyle = "#ffffff";
  ctx.fillText(String(ball.id), ball.x, ball.y);

  ctx.restore();
}

/**
 * 绘制纯色球
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} ball
 */
function drawSolidBall(ctx, ball) {
  ctx.save();

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = ball.color;
  ctx.fill();

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.stroke();

  ctx.restore();

  // 母球不显示数字
  if (ball.id !== 0) {
    drawBallNumber(ctx, ball);
  }
}

/**
 * 绘制花色球
 * 白底圆 + 中间横向色带 + 白色数字
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} ball
 */
function drawStripeBall(ctx, ball) {
  ctx.save();

  // 白底球体
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // 裁剪后绘制横向色带
  ctx.save();
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.clip();

  const stripeHeight = ball.radius * 1.2;
  ctx.fillStyle = ball.color;
  ctx.fillRect(
    ball.x - ball.radius,
    ball.y - stripeHeight / 2,
    ball.radius * 2,
    stripeHeight
  );

  ctx.restore();

  // 外边线
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.stroke();

  ctx.restore();

  drawBallNumber(ctx, ball);
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

  // 母球
  if (ball.id === 0) {
    drawSolidBall(ctx, {
      ...ball,
      color: "#ffffff"
    });
    return;
  }

  // 8 号球
  if (ball.id === 8) {
    drawSolidBall(ctx, {
      ...ball,
      color: "#000000"
    });
    return;
  }

  // 花色球
  if (ball.isStripe) {
    drawStripeBall(ctx, ball);
    return;
  }

  // 纯色球
  drawSolidBall(ctx, ball);
}

/**
 * 渲染所有未进袋的球
 * @param {CanvasRenderingContext2D} ctx
 * @param {object[]} balls
 */
export function drawBalls(ctx, balls) {
  balls.forEach((ball) => {
    drawBall(ctx, ball);
  });
}
