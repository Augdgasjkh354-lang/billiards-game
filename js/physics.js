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

export function updateBalls(balls) {
  balls.forEach((ball) => {
    if (ball.isPocketed) return;

    ball.x += ball.vx;
    ball.y += ball.vy;

    ball.vx *= FRICTION;
    ball.vy *= FRICTION;

    if (Math.abs(ball.vx) < MIN_VELOCITY) ball.vx = 0;
    if (Math.abs(ball.vy) < MIN_VELOCITY) ball.vy = 0;

    // 加塞持续漂移效果（母球运动中侧旋）
    if (ball.id === 0 && ball.spin) {
      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed > MIN_VELOCITY) {
        const dirX = ball.vx / speed;
        const dirY = ball.vy / speed;
        const perpX = -dirY;
        const perpY = dirX;
        ball.vx += perpX * ball.spin.x * 0.04;
        ball.vy += perpY * ball.spin.x * 0.04;
        ball.spin.x *= 0.97;
        ball.spin.y *= 0.97;
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

  if (ball.x < minX) { ball.x = minX; ball.vx = -ball.vx; }
  else if (ball.x > maxX) { ball.x = maxX; ball.vx = -ball.vx; }

  if (ball.y < minY) { ball.y = minY; ball.vy = -ball.vy; }
  else if (ball.y > maxY) { ball.y = maxY; ball.vy = -ball.vy; }
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

      let nx, ny;
      const safeDistance = distance || 0.0001;
      nx = dx / safeDistance;
      ny = dy / safeDistance;

      const tx = -ny;
      const ty = nx;

      const vA_n = ballA.vx * nx + ballA.vy * ny;
      const vA_t = ballA.vx * tx + ballA.vy * ty;
      const vB_n = ballB.vx * nx + ballB.vy * ny;
      const vB_t = ballB.vx * tx + ballB.vy * ty;

      ballA.vx = vB_n * nx + vA_t * tx;
      ballA.vy = vB_n * ny + vA_t * ty;
      ballB.vx = vA_n * nx + vB_t * tx;
      ballB.vy = vA_n * ny + vB_t * ty;

      // 碰撞后加塞效果
      const cueBall = ballA.id === 0 ? ballA : (ballB.id === 0 ? ballB : null);
      if (cueBall && cueBall.spin) {
        const sf = cueBall.spinFactor || 3;
        // 碰撞法线方向（母球→目标球）
        const cnx = cueBall.id === 0 ? nx : -nx;
        const cny = cueBall.id === 0 ? ny : -ny;
        // 高杆(spin.y<0)：母球沿法线继续前进；低杆(spin.y>0)：母球沿法线反弹
        cueBall.vx += cnx * (-cueBall.spin.y) * sf;
        cueBall.vy += cny * (-cueBall.spin.y) * sf;
        // 左右加塞：母球侧向偏转
        cueBall.vx += (-cny) * cueBall.spin.x * sf * 0.4;
        cueBall.vy += cnx * cueBall.spin.x * sf * 0.4;
        cueBall.spin = null;
        cueBall.spinFactor = 0;
      }

      // 分离重叠
      const overlap = (minDistance - safeDistance) / 2;
      ballA.x -= nx * overlap;
      ballA.y -= ny * overlap;
      ballB.x += nx * overlap;
      ballB.y += ny * overlap;
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

      if (distance < POCKET_RADIUS) {
        if (ball.id === 0) {
          const reset = getCueBallResetPosition();
          ball.x = reset.x;
          ball.y = reset.y;
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
