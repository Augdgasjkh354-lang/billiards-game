import {
  TABLE_WIDTH,
  TABLE_HEIGHT,
  TABLE_PADDING,
  BALL_RADIUS,
  POCKET_RADIUS,
  POCKETS,
  FRICTION,
  MIN_VELOCITY
} from "./constants.js";

/**
 * 更新所有未进袋球的位置和速度
 * 每帧：
 * - x += vx
 * - y += vy
 * - vx *= FRICTION
 * - vy *= FRICTION
 * - 小于最小速度阈值时归零
 *
 * @param {Array<Object>} balls
 */
export function updateBalls(balls) {
  balls.forEach((ball) => {
    if (ball.isPocketed) {
      return;
    }

    ball.x += ball.vx;
    ball.y += ball.vy;

    ball.vx *= FRICTION;
    ball.vy *= FRICTION;

    if (Math.abs(ball.vx) < MIN_VELOCITY) {
      ball.vx = 0;
    }

    if (Math.abs(ball.vy) < MIN_VELOCITY) {
      ball.vy = 0;
    }
  });
}

/**
 * 处理单颗球与库边碰撞
 * 可移动区域：
 * TABLE_PADDING + BALL_RADIUS
 * 到
 * TABLE_WIDTH/HEIGHT - TABLE_PADDING - BALL_RADIUS
 *
 * @param {Object} ball
 */
export function handleWallCollisions(ball) {
  if (ball.isPocketed) {
    return;
  }

  const minX = TABLE_PADDING + BALL_RADIUS;
  const maxX = TABLE_WIDTH - TABLE_PADDING - BALL_RADIUS;
  const minY = TABLE_PADDING + BALL_RADIUS;
  const maxY = TABLE_HEIGHT - TABLE_PADDING - BALL_RADIUS;

  if (ball.x < minX) {
    ball.x = minX;
    ball.vx = -ball.vx;
  } else if (ball.x > maxX) {
    ball.x = maxX;
    ball.vx = -ball.vx;
  }

  if (ball.y < minY) {
    ball.y = minY;
    ball.vy = -ball.vy;
  } else if (ball.y > maxY) {
    ball.y = maxY;
    ball.vy = -ball.vy;
  }
}

/**
 * 处理所有球对之间的弹性碰撞（等质量）
 * 逻辑：
 * - 距离小于两球半径和时触发碰撞
 * - 交换法线方向速度分量
 * - 保留切线方向速度分量
 * - 做位置分离，防止重叠
 *
 * @param {Array<Object>} balls
 */
export function handleBallCollisions(balls) {
  for (let i = 0; i < balls.length; i += 1) {
    const ballA = balls[i];

    if (ballA.isPocketed) {
      continue;
    }

    for (let j = i + 1; j < balls.length; j += 1) {
      const ballB = balls[j];

      if (ballB.isPocketed) {
        continue;
      }

      const dx = ballB.x - ballA.x;
      const dy = ballB.y - ballA.y;
      const distance = Math.hypot(dx, dy);
      const minDistance = ballA.radius + ballB.radius;

      if (distance >= minDistance) {
        continue;
      }

      // 避免两球完全重合导致除零
      let nx;
      let ny;
      let safeDistance = distance;

      if (safeDistance === 0) {
        nx = 1;
        ny = 0;
        safeDistance = 0.0001;
      } else {
        nx = dx / safeDistance;
        ny = dy / safeDistance;
      }

      // 切线单位向量
      const tx = -ny;
      const ty = nx;

      // 速度在法线和切线方向上的分量
      const vA_n = ballA.vx * nx + ballA.vy * ny;
      const vA_t = ballA.vx * tx + ballA.vy * ty;
      const vB_n = ballB.vx * nx + ballB.vy * ny;
      const vB_t = ballB.vx * tx + ballB.vy * ty;

      // 等质量弹性碰撞：交换法线分量
      const newVA_n = vB_n;
      const newVB_n = vA_n;

      // 合成回 x/y 方向速度
      ballA.vx = newVA_n * nx + vA_t * tx;
      ballA.vy = newVA_n * ny + vA_t * ty;
      ballB.vx = newVB_n * nx + vB_t * tx;
      ballB.vy = newVB_n * ny + vB_t * ty;

      // 位置分离，防止球重叠卡住
      const overlap = minDistance - safeDistance;
      const separation = overlap / 2;

      ballA.x -= nx * separation;
      ballA.y -= ny * separation;
      ballB.x += nx * separation;
      ballB.y += ny * separation;
    }
  }
}

/**
 * 检测进袋
 * 规则：
 * - 遍历每颗球和每个袋口
 * - 距离小于 POCKET_RADIUS 时，视为进袋
 * - 进袋后速度归零
 * - 返回本帧进袋球 id 数组
 *
 * @param {Array<Object>} balls
 * @returns {number[]}
 */
export function checkPockets(balls) {
  const pocketedBallIds = [];

  balls.forEach((ball) => {
    if (ball.isPocketed) {
      return;
    }

    for (const pocket of POCKETS) {
      const dx = ball.x - pocket.x;
      const dy = ball.y - pocket.y;
      const distance = Math.hypot(dx, dy);

      if (distance < POCKET_RADIUS) {
        ball.isPocketed = true;
        ball.vx = 0;
        ball.vy = 0;
        pocketedBallIds.push(ball.id);
        break;
      }
    }
  });

  return pocketedBallIds;
}
