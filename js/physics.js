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
 * 获取母球进袋后的复位位置
 * 厨房区：台面左侧 1/4，垂直居中
 *
 * @returns {{ x: number, y: number }}
 */
function getCueBallResetPosition() {
  const innerWidth = TABLE_WIDTH - TABLE_PADDING * 2;
  const innerHeight = TABLE_HEIGHT - TABLE_PADDING * 2;

  return {
    x: TABLE_PADDING + innerWidth * 0.25,
    y: TABLE_PADDING + innerHeight / 2
  };
}

/**
 * 更新所有未进袋球的位置和速度
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
 * 并在母球参与碰撞时叠加一次加塞修正
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

      const tx = -ny;
      const ty = nx;

      const vA_n = ballA.vx * nx + ballA.vy * ny;
      const vA_t = ballA.vx * tx + ballA.vy * ty;
      const vB_n = ballB.vx * nx + ballB.vy * ny;
      const vB_t = ballB.vx * tx + ballB.vy * ty;

      const newVA_n = vB_n;
      const newVB_n = vA_n;

      ballA.vx = newVA_n * nx + vA_t * tx;
      ballA.vy = newVA_n * ny + vA_t * ty;
      ballB.vx = newVB_n * nx + vB_t * tx;
      ballB.vy = newVB_n * ny + vB_t * ty;

      // -------------------------
      // 加塞修正：
      // 当母球与目标球碰撞后，读取母球上的 spin / spinFactor
      // 并只叠加一次，然后清空
      // -------------------------
      const nxPerpendicular = -ny;

      if (ballA.id === 0 && ballB.id !== 0 && ballA.spin) {
        ballA.vx += ballA.spin.x * (ballA.spinFactor || 0) * nxPerpendicular;
        ballA.vy += ballA.spin.y * (ballA.spinFactor || 0);
        ballA.spin = null;
        ballA.spinFactor = 0;
      } else if (ballB.id === 0 && ballA.id !== 0 && ballB.spin) {
        ballB.vx += ballB.spin.x * (ballB.spinFactor || 0) * nxPerpendicular;
        ballB.vy += ballB.spin.y * (ballB.spinFactor || 0);
        ballB.spin = null;
        ballB.spinFactor = 0;
      }

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
 *
 * 规则：
 * - 普通球：进袋后标记 isPocketed=true，速度归零
 * - 母球：不标记进袋，而是复位到厨房区并清零速度
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
        if (ball.id === 0) {
          const resetPosition = getCueBallResetPosition();
          ball.x = resetPosition.x;
          ball.y = resetPosition.y;
          ball.vx = 0;
          ball.vy = 0;
          pocketedBallIds.push(ball.id);
          break;
        }

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
