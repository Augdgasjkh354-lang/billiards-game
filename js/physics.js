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

function getCueBallResetPosition() {
  const innerWidth = TABLE_WIDTH - TABLE_PADDING * 2;
  const innerHeight = TABLE_HEIGHT - TABLE_PADDING * 2;

  return {
    x: TABLE_PADDING + innerWidth * 0.25,
    y: TABLE_PADDING + innerHeight / 2
  };
}

/**
 * 为母球寻找一个不与其他球重叠的复位点。
 * 优先默认开球点，不可用时在厨房区内网格搜索最近点。
 *
 * @param {Array<Object>} balls
 * @returns {{ x:number, y:number }}
 */
function getCueBallSafeResetPosition(balls) {
  const preferred = getCueBallResetPosition();

  const isPositionFree = (x, y) => {
    return balls.every((ball) => {
      if (ball.id === 0 || ball.isPocketed) {
        return true;
      }

      const distance = Math.hypot(ball.x - x, ball.y - y);
      return distance >= BALL_RADIUS + ball.radius + 1;
    });
  };

  if (isPositionFree(preferred.x, preferred.y)) {
    return preferred;
  }

  const minX = TABLE_PADDING + BALL_RADIUS;
  const maxX = TABLE_WIDTH / 2 - BALL_RADIUS;
  const minY = TABLE_PADDING + BALL_RADIUS;
  const maxY = TABLE_HEIGHT - TABLE_PADDING - BALL_RADIUS;

  let bestPosition = preferred;
  let bestDistanceSq = Infinity;

  for (let x = minX; x <= maxX; x += 4) {
    for (let y = minY; y <= maxY; y += 4) {
      if (!isPositionFree(x, y)) {
        continue;
      }

      const dx = x - preferred.x;
      const dy = y - preferred.y;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestPosition = { x, y };
      }
    }
  }

  return bestPosition;
}

export function updateBalls(balls) {
  balls.forEach((ball) => {
    if (ball.isPocketed) return;

    ball.x += ball.vx;
    ball.y += ball.vy;

    ball.vx *= FRICTION;
    ball.vy *= FRICTION;

    if (Math.abs(ball.vx) < MIN_VELOCITY) ball.vx = 0;
    if (Math.abs(ball.vy) < MIN_VELOCITY) ball.vy = 0;

    // 母球持续侧旋漂移效果
    if (ball.id === 0 && ball.spin) {
      const speed = Math.hypot(ball.vx, ball.vy);

      if (speed > MIN_VELOCITY) {
        const dirX = ball.vx / speed;
        const dirY = ball.vy / speed;

        // 垂直于当前运动方向
        const perpX = -dirY;
        const perpY = dirX;

        // 左右加塞产生轻微横向漂移
        ball.vx += perpX * ball.spin.x * 0.04;
        ball.vy += perpY * ball.spin.x * 0.04;

        // 旋转逐渐衰减
        ball.spin.x *= 0.97;
        ball.spin.y *= 0.97;

        // 清理极小旋转，避免长时间微漂移
        if (Math.abs(ball.spin.x) < 0.01) ball.spin.x = 0;
        if (Math.abs(ball.spin.y) < 0.01) ball.spin.y = 0;

        if (ball.spin.x === 0 && ball.spin.y === 0) {
          ball.spin = null;
        }
      } else {
        ball.spin = null;
      }
    }
  });
}

export function handleWallCollisions(ball) {
  if (ball.isPocketed) return;

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

export function handleBallCollisions(balls) {
  for (let i = 0; i < balls.length; i += 1) {
    const ballA = balls[i];
    if (ballA.isPocketed) continue;

    for (let j = i + 1; j < balls.length; j += 1) {
      const ballB = balls[j];
      if (ballB.isPocketed) continue;

      const dx = ballB.x - ballA.x;
      const dy = ballB.y - ballA.y;
      const distance = Math.hypot(dx, dy);
      const minDistance = ballA.radius + ballB.radius;

      if (distance >= minDistance) continue;

      let nx;
      let ny;
      let safeDistance = distance;

      if (distance === 0) {
        nx = 1;
        ny = 0;
        safeDistance = 0.0001;
      } else {
        nx = dx / distance;
        ny = dy / distance;
      }

      // 切线方向
      const tx = -ny;
      const ty = nx;

      // 法线方向速度
      const vA_n = ballA.vx * nx + ballA.vy * ny;
      const vB_n = ballB.vx * nx + ballB.vy * ny;

      // 切线方向速度
      const vA_t = ballA.vx * tx + ballA.vy * ty;
      const vB_t = ballB.vx * tx + ballB.vy * ty;

      // 等质量弹性碰撞：交换法线方向速度
      const newVA_n = vB_n;
      const newVB_n = vA_n;

      ballA.vx = newVA_n * nx + vA_t * tx;
      ballA.vy = newVA_n * ny + vA_t * ty;

      ballB.vx = newVB_n * nx + vB_t * tx;
      ballB.vy = newVB_n * ny + vB_t * ty;

      // 母球碰撞后的加塞效果
      const cueBall =
        ballA.id === 0 ? ballA : ballB.id === 0 ? ballB : null;

      if (cueBall && cueBall.spin) {
        const spinFactor = cueBall.spinFactor || 3;

        // 母球 -> 目标球的碰撞法线
        const cnx = cueBall === ballA ? nx : -nx;
        const cny = cueBall === ballA ? ny : -ny;

        // 高杆 / 低杆
        // spin.y < 0 => 高杆，继续前冲
        // spin.y > 0 => 低杆，向后回拉
        cueBall.vx += cnx * (-cueBall.spin.y) * spinFactor;
        cueBall.vy += cny * (-cueBall.spin.y) * spinFactor;

        // 左右加塞
        cueBall.vx += -cny * cueBall.spin.x * spinFactor * 0.4;
        cueBall.vy += cnx * cueBall.spin.x * spinFactor * 0.4;

        // 碰撞后只生效一次
        cueBall.spin = null;
        cueBall.spinFactor = 0;
      }

      // 分离重叠
      const overlap = minDistance - safeDistance;
      const separation = overlap / 2;

      ballA.x -= nx * separation;
      ballA.y -= ny * separation;

      ballB.x += nx * separation;
      ballB.y += ny * separation;
    }
  }
}

export function checkPockets(balls) {
  const pocketedBallIds = [];

  balls.forEach((ball) => {
    if (ball.isPocketed) return;

    for (const pocket of POCKETS) {
      const dx = ball.x - pocket.x;
      const dy = ball.y - pocket.y;
      const distance = Math.hypot(dx, dy);

      // 使用每个袋口自己的半径
      if (distance < (pocket.radius || POCKET_RADIUS)) {
        // 母球进袋：复位到厨房区（且避免与其他球重叠）
        if (ball.id === 0) {
          const resetPosition = getCueBallSafeResetPosition(balls);

          ball.x = resetPosition.x;
          ball.y = resetPosition.y;
          ball.vx = 0;
          ball.vy = 0;
          ball.spin = null;
          ball.spinFactor = 0;

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
