import {
  TABLE_WIDTH,
  TABLE_HEIGHT,
  TABLE_PADDING,
  BALL_RADIUS
} from "./constants.js";

/**
 * 球杆系统配置
 */
const MAX_POWER = 25;
const FULL_CHARGE_TIME = 1200; // 毫秒，按住约 1.2 秒充满
const CUE_LENGTH = 150;
const CUE_BASE_OFFSET = BALL_RADIUS + 14;
const CUE_PULLBACK_MAX = 28;

/**
 * 判断当前是否所有球都静止
 * @param {Array<Object>} balls
 * @returns {boolean}
 */
function areAllBallsStopped(balls) {
  return balls.every((ball) => {
    if (ball.isPocketed) {
      return true;
    }

    return Math.hypot(ball.vx, ball.vy) < 0.01;
  });
}

/**
 * 获取母球
 * @param {Array<Object>} balls
 * @returns {Object | undefined}
 */
function getCueBall(balls) {
  return balls.find((ball) => ball.id === 0);
}

/**
 * 将鼠标 / 触摸点转换为相对 canvas 的坐标
 * 需要考虑 CSS 缩放
 *
 * @param {MouseEvent | TouchEvent} event
 * @param {HTMLCanvasElement} canvas
 * @returns {{ x: number, y: number } | null}
 */
function getCanvasPoint(event, canvas) {
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
 * 更新底部力度条
 * @param {HTMLElement | null} powerFillEl
 * @param {number} power
 */
function updatePowerBar(powerFillEl, power) {
  if (!powerFillEl) {
    return;
  }

  const percent = Math.max(0, Math.min(100, (power / MAX_POWER) * 100));
  powerFillEl.style.width = `${percent}%`;
}

/**
 * 计算从母球出发，沿指定方向到达库边的距离
 * 这里使用绿色台面边缘作为瞄准线终点边界
 *
 * @param {Object} cueBall
 * @param {number} dirX
 * @param {number} dirY
 * @returns {number}
 */
function getWallDistance(cueBall, dirX, dirY) {
  const minX = TABLE_PADDING;
  const maxX = TABLE_WIDTH - TABLE_PADDING;
  const minY = TABLE_PADDING;
  const maxY = TABLE_HEIGHT - TABLE_PADDING;

  let tMin = Infinity;

  if (dirX > 0) {
    tMin = Math.min(tMin, (maxX - cueBall.x) / dirX);
  } else if (dirX < 0) {
    tMin = Math.min(tMin, (minX - cueBall.x) / dirX);
  }

  if (dirY > 0) {
    tMin = Math.min(tMin, (maxY - cueBall.y) / dirY);
  } else if (dirY < 0) {
    tMin = Math.min(tMin, (minY - cueBall.y) / dirY);
  }

  return tMin;
}

/**
 * 计算瞄准线终点：
 * - 碰到第一颗球时停止
 * - 否则延伸到库边
 *
 * 这里使用“射线与圆”的相交测试。
 * 对于母球运动路径，碰撞判定半径使用两球半径和。
 *
 * @param {Object} cueBall
 * @param {Array<Object>} balls
 * @param {number} angle
 * @returns {{ x: number, y: number }}
 */
function getAimEndPoint(cueBall, balls, angle) {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);

  const wallDistance = getWallDistance(cueBall, dirX, dirY);
  let nearestDistance = wallDistance;

  balls.forEach((ball) => {
    if (ball.id === 0 || ball.isPocketed) {
      return;
    }

    const relX = ball.x - cueBall.x;
    const relY = ball.y - cueBall.y;

    // 球心投影到射线方向
    const projection = relX * dirX + relY * dirY;
    if (projection <= 0) {
      return;
    }

    // 球心到射线的垂直距离平方
    const distSq = relX * relX + relY * relY - projection * projection;

    // 母球中心轨迹与目标球发生接触时的有效半径
    const collisionRadius = cueBall.radius + ball.radius;
    const collisionRadiusSq = collisionRadius * collisionRadius;

    if (distSq > collisionRadiusSq) {
      return;
    }

    const offset = Math.sqrt(collisionRadiusSq - distSq);
    const hitDistance = projection - offset;

    if (hitDistance > 0 && hitDistance < nearestDistance) {
      nearestDistance = hitDistance;
    }
  });

  return {
    x: cueBall.x + dirX * nearestDistance,
    y: cueBall.y + dirY * nearestDistance
  };
}

/**
 * 初始化球杆交互
 * 返回 drawCue，供 game.js 每帧调用
 *
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<Object>} balls
 * @returns {{ drawCue: Function }}
 */
export function initCue(canvas, ctx, balls) {
  let aimAngle = 0;
  let isCharging = false;
  let chargeStartTime = 0;
  let currentPower = 0;

  const powerFillEl = document.querySelector(".power-fill");

  // 避免触摸时浏览器默认滚动 / 手势干扰
  canvas.style.touchAction = "none";

  updatePowerBar(powerFillEl, 0);

  /**
   * 从事件更新瞄准角度
   * @param {MouseEvent | TouchEvent} event
   */
  function updateAimAngle(event) {
    const cueBall = getCueBall(balls);
    if (!cueBall || cueBall.isPocketed) {
      return;
    }

    const point = getCanvasPoint(event, canvas);
    if (!point) {
      return;
    }

    const dx = point.x - cueBall.x;
    const dy = point.y - cueBall.y;

    if (dx === 0 && dy === 0) {
      return;
    }

    aimAngle = Math.atan2(dy, dx);
  }

  /**
   * 开始蓄力
   * @param {MouseEvent | TouchEvent} event
   */
  function startCharge(event) {
    const cueBall = getCueBall(balls);

    if (!cueBall || cueBall.isPocketed) {
      return;
    }

    if (!areAllBallsStopped(balls)) {
      return;
    }

    updateAimAngle(event);

    isCharging = true;
    chargeStartTime = performance.now();
    currentPower = 0;
    updatePowerBar(powerFillEl, 0);
  }

  /**
   * 结束蓄力并击球
   * @param {MouseEvent | TouchEvent} event
   */
  function releaseShot(event) {
    if (!isCharging) {
      return;
    }

    const cueBall = getCueBall(balls);
    if (!cueBall || cueBall.isPocketed) {
      isCharging = false;
      currentPower = 0;
      updatePowerBar(powerFillEl, 0);
      return;
    }

    updateAimAngle(event);

    const power = currentPower;
    const dirX = Math.cos(aimAngle);
    const dirY = Math.sin(aimAngle);

    cueBall.vx = dirX * power;
    cueBall.vy = dirY * power;

    isCharging = false;
    currentPower = 0;
    updatePowerBar(powerFillEl, 0);
  }

  /**
   * 鼠标移动
   * @param {MouseEvent} event
   */
  function handleMouseMove(event) {
    updateAimAngle(event);
  }

  /**
   * 触摸移动
   * @param {TouchEvent} event
   */
  function handleTouchMove(event) {
    event.preventDefault();
    updateAimAngle(event);
  }

  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("touchmove", handleTouchMove, { passive: false });

  canvas.addEventListener("mousedown", startCharge);
  canvas.addEventListener("touchstart", (event) => {
    event.preventDefault();
    startCharge(event);
  }, { passive: false });

  window.addEventListener("mouseup", releaseShot);
  window.addEventListener("touchend", (event) => {
    event.preventDefault();
    releaseShot(event);
  }, { passive: false });

  window.addEventListener("touchcancel", () => {
    isCharging = false;
    currentPower = 0;
    updatePowerBar(powerFillEl, 0);
  }, { passive: false });

  /**
   * 每帧绘制瞄准线与球杆
   */
  function drawCue() {
    const cueBall = getCueBall(balls);

    if (!cueBall || cueBall.isPocketed) {
      updatePowerBar(powerFillEl, 0);
      return;
    }

    // 只有所有球静止时才显示球杆和瞄准线
    if (!areAllBallsStopped(balls)) {
      updatePowerBar(powerFillEl, 0);
      return;
    }

    if (isCharging) {
      const elapsed = performance.now() - chargeStartTime;
      const ratio = Math.min(1, elapsed / FULL_CHARGE_TIME);
      currentPower = MAX_POWER * ratio;
      updatePowerBar(powerFillEl, currentPower);
    }

    const dirX = Math.cos(aimAngle);
    const dirY = Math.sin(aimAngle);

    // -------- 瞄准线 --------
    const aimStartX = cueBall.x + dirX * (cueBall.radius + 2);
    const aimStartY = cueBall.y + dirY * (cueBall.radius + 2);
    const aimEnd = getAimEndPoint(cueBall, balls, aimAngle);

    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([10, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.moveTo(aimStartX, aimStartY);
    ctx.lineTo(aimEnd.x, aimEnd.y);
    ctx.stroke();
    ctx.restore();

    // -------- 球杆 --------
    const chargeRatio = currentPower / MAX_POWER;
    const pullBack = isCharging ? chargeRatio * CUE_PULLBACK_MAX : 0;

    const cueNearDistance = CUE_BASE_OFFSET + pullBack;
    const cueFarDistance = cueNearDistance + CUE_LENGTH;

    const cueNearX = cueBall.x - dirX * cueNearDistance;
    const cueNearY = cueBall.y - dirY * cueNearDistance;
    const cueFarX = cueBall.x - dirX * cueFarDistance;
    const cueFarY = cueBall.y - dirY * cueFarDistance;

    ctx.save();
    ctx.beginPath();
    ctx.lineCap = "round";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#8b5a2b";
    ctx.moveTo(cueFarX, cueFarY);
    ctx.lineTo(cueNearX, cueNearY);
    ctx.stroke();

    // 杆头
    ctx.beginPath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#d8c3a5";
    ctx.moveTo(cueNearX, cueNearY);
    ctx.lineTo(
      cueNearX + dirX * 12,
      cueNearY + dirY * 12
    );
    ctx.stroke();
    ctx.restore();
  }

  return {
    drawCue
  };
}
