import {
  TABLE_WIDTH,
  TABLE_HEIGHT,
  TABLE_PADDING,
  BALL_RADIUS,
  POCKET_RADIUS,
  POCKETS,
  MIN_VELOCITY,
  MIN_ANGULAR,
  ROLLING_FRICTION,
  SLIDING_DECELERATION,
  ROLLING_THRESHOLD,
  COR_BALL,
  COR_CUSHION,
  CUSHION_TANGENTIAL_FRICTION,
  INERTIA_FACTOR,
  SPIN_SIDE_EFFECT,
  SPIN_ROLLING_DECAY,
  SPIN_SLIDING_DECAY
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

    const speed = Math.hypot(ball.vx, ball.vy);

    if (speed > MIN_VELOCITY) {
      const dirX = ball.vx / speed;
      const dirY = ball.vy / speed;

      // 计算滑差：线速度 vs 滚动接触速度
      const slip = speed - ball.omega * BALL_RADIUS;

      if (Math.abs(slip) > ROLLING_THRESHOLD) {
        // 滑动阶段：切向减速，角速度向滚动收敛
        const decel = Math.min(SLIDING_DECELERATION, speed);
        const newSpeed = speed - decel;

        ball.vx = dirX * newSpeed;
        ball.vy = dirY * newSpeed;

        // 角加速度：α = 5F/(2mr)，单位质量且 r = BALL_RADIUS
        const angularAccel = (5 / 2) * decel / BALL_RADIUS;
        if (slip > 0) {
          // 线速度大于滚动速度 → 增大 omega（前旋收敛）
          ball.omega = Math.min(ball.omega + angularAccel, newSpeed / BALL_RADIUS);
        } else {
          // 线速度小于滚动速度（超旋）→ 减小 omega
          ball.omega = Math.max(ball.omega - angularAccel, newSpeed / BALL_RADIUS);
        }

        ball.spinX *= SPIN_SLIDING_DECAY;
      } else {
        // 滚动阶段：对齐角速度，统一施加滚动摩擦
        ball.omega = speed / BALL_RADIUS;
        ball.vx *= ROLLING_FRICTION;
        ball.vy *= ROLLING_FRICTION;
        ball.omega *= ROLLING_FRICTION;

        ball.spinX *= SPIN_ROLLING_DECAY;
      }

      // 侧旋横向漂移（速度正比，快球弧度更大）
      if (Math.abs(ball.spinX) > MIN_ANGULAR) {
        const currentSpeed = Math.hypot(ball.vx, ball.vy);
        const perpX = -dirY;
        const perpY = dirX;
        const driftStrength = ball.spinX * SPIN_SIDE_EFFECT * (currentSpeed / 10.0);
        ball.vx += perpX * driftStrength;
        ball.vy += perpY * driftStrength;
      }

      // 清零极小旋转
      if (Math.abs(ball.spinX) < MIN_ANGULAR) ball.spinX = 0;
      if (Math.abs(ball.omega) < MIN_ANGULAR) ball.omega = 0;

      // 速度阈值清零
      if (Math.abs(ball.vx) < MIN_VELOCITY) ball.vx = 0;
      if (Math.abs(ball.vy) < MIN_VELOCITY) ball.vy = 0;
    } else {
      ball.vx = 0;
      ball.vy = 0;
      ball.omega = 0;
      ball.spinX = 0;
    }

    ball.x += ball.vx;
    ball.y += ball.vy;
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
    ball.vx = Math.abs(ball.vx) * COR_CUSHION;
    ball.vy *= CUSHION_TANGENTIAL_FRICTION;
    // 侧旋在侧面库边反向（英式旋转真实物理）
    ball.spinX = -ball.spinX * COR_CUSHION;
    ball.omega *= COR_CUSHION;
  } else if (ball.x > maxX) {
    ball.x = maxX;
    ball.vx = -Math.abs(ball.vx) * COR_CUSHION;
    ball.vy *= CUSHION_TANGENTIAL_FRICTION;
    ball.spinX = -ball.spinX * COR_CUSHION;
    ball.omega *= COR_CUSHION;
  }

  if (ball.y < minY) {
    ball.y = minY;
    ball.vy = Math.abs(ball.vy) * COR_CUSHION;
    ball.vx *= CUSHION_TANGENTIAL_FRICTION;
    ball.omega *= COR_CUSHION;
  } else if (ball.y > maxY) {
    ball.y = maxY;
    ball.vy = -Math.abs(ball.vy) * COR_CUSHION;
    ball.vx *= CUSHION_TANGENTIAL_FRICTION;
    ball.omega *= COR_CUSHION;
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

      // 法线方向速度分量
      const vA_n = ballA.vx * nx + ballA.vy * ny;
      const vB_n = ballB.vx * nx + ballB.vy * ny;

      // 切线方向速度分量（不变）
      const vA_t = ballA.vx * tx + ballA.vy * ty;
      const vB_t = ballB.vx * tx + ballB.vy * ty;

      // 等质量球，带 COR 的碰撞冲量
      // impulse = (1 + COR) / 2 * (vA_n - vB_n)
      const impulse = (1 + COR_BALL) / 2 * (vA_n - vB_n);
      const newVA_n = vA_n - impulse;
      const newVB_n = vB_n + impulse;

      ballA.vx = newVA_n * nx + vA_t * tx;
      ballA.vy = newVA_n * ny + vA_t * ty;

      ballB.vx = newVB_n * nx + vB_t * tx;
      ballB.vy = newVB_n * ny + vB_t * ty;

      // 旋转传递：按转动惯量系数将 omega 部分传递给被撞球
      // transferFraction = I/(m*r² + I) ≈ INERTIA_FACTOR/(1+INERTIA_FACTOR)
      const transferFrac = INERTIA_FACTOR / (1 + INERTIA_FACTOR);
      const omegaTransfer = (ballA.omega - ballB.omega) * transferFrac * 0.15;
      ballA.omega -= omegaTransfer;
      ballB.omega += omegaTransfer;

      // 侧旋部分传递
      const spinXTransfer = (ballA.spinX - ballB.spinX) * transferFrac * 0.1;
      ballA.spinX -= spinXTransfer;
      ballB.spinX += spinXTransfer;

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

      if (distance < (pocket.radius || POCKET_RADIUS)) {
        if (ball.id === 0) {
          const resetPosition = getCueBallSafeResetPosition(balls);

          ball.x = resetPosition.x;
          ball.y = resetPosition.y;
          ball.vx = 0;
          ball.vy = 0;
          ball.omega = 0;
          ball.spinX = 0;
          ball.spin = null;
          ball.spinFactor = 0;

          pocketedBallIds.push(ball.id);
          break;
        }

        ball.isPocketed = true;
        ball.vx = 0;
        ball.vy = 0;
        ball.omega = 0;
        ball.spinX = 0;

        pocketedBallIds.push(ball.id);
        break;
      }
    }
  });

  return pocketedBallIds;
}
