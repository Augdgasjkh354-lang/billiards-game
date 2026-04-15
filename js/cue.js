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
const FULL_CHARGE_TIME = 1200; // 桌面端按住约 1.2 秒充满
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
 * 使用绿色台面边缘作为瞄准线终点边界
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

    const projection = relX * dirX + relY * dirY;
    if (projection <= 0) {
      return;
    }

    const distSq = relX * relX + relY * relY - projection * projection;
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
 * 桌面端：
 * - mousemove 控制方向
 * - mousedown 开始蓄力
 * - mouseup 击球
 *
 * 移动端：
 * - touchstart 记录起始点
 * - touchmove：
 *   1) 瞄准方向 = 从触摸起始点指向母球
 *   2) 力度 = 当前手指位置相对起始点的拖拽距离
 * - touchend 按当前角度和力度击球
 *
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<Object>} balls
 * @returns {{ drawCue: Function }}
 */
export function initCue(canvas, ctx, balls) {
  let aimAngle = 0;

  // 桌面端状态
  let isMouseCharging = false;
  let mouseChargeStartTime = 0;
  let mousePower = 0;

  // 移动端状态
  let isTouchAiming = false;
  let touchPower = 0;
  let touchStartPoint = null;
  let touchCurrentPoint = null;

  const powerFillEl = document.querySelector(".power-fill");

  canvas.style.touchAction = "none";
  updatePowerBar(powerFillEl, 0);

  /**
   * 当前是否正在任意形式蓄力
   * @returns {boolean}
   */
  function isCharging() {
    return isMouseCharging || isTouchAiming;
  }

  /**
   * 当前可用于绘制球杆后拉的力度值
   * @returns {number}
   */
  function getCurrentPower() {
    if (isTouchAiming) {
      return touchPower;
    }

    if (isMouseCharging) {
      return mousePower;
    }

    return 0;
  }

  /**
   * 更新桌面端瞄准角度
   * @param {MouseEvent} event
   */
  function updateMouseAimAngle(event) {
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
   * 根据移动端起始触摸点更新瞄准角度
   * 瞄准方向 = 从触摸起始点指向母球
   *
   * @param {{ x: number, y: number }} startPoint
   */
  function updateTouchAimAngle(startPoint) {
    const cueBall = getCueBall(balls);
    if (!cueBall || cueBall.isPocketed || !startPoint) {
      return;
    }

    const dx = cueBall.x - startPoint.x;
    const dy = cueBall.y - startPoint.y;

    if (dx === 0 && dy === 0) {
      return;
    }

    aimAngle = Math.atan2(dy, dx);
  }

  /**
   * 桌面端开始蓄力
   * @param {MouseEvent} event
   */
  function startMouseCharge(event) {
    const cueBall = getCueBall(balls);

    if (!cueBall || cueBall.isPocketed) {
      return;
    }

    if (!areAllBallsStopped(balls)) {
      return;
    }

    updateMouseAimAngle(event);

    isMouseCharging = true;
    mouseChargeStartTime = performance.now();
    mousePower = 0;
    updatePowerBar(powerFillEl, 0);
  }

  /**
   * 桌面端释放击球
   * @param {MouseEvent} event
   */
  function releaseMouseShot(event) {
    if (!isMouseCharging) {
      return;
    }

    const cueBall = getCueBall(balls);
    if (!cueBall || cueBall.isPocketed) {
      isMouseCharging = false;
      mousePower = 0;
      updatePowerBar(powerFillEl, 0);
      return;
    }

    updateMouseAimAngle(event);

    const power = mousePower;
    const dirX = Math.cos(aimAngle);
    const dirY = Math.sin(aimAngle);

    cueBall.vx = dirX * power;
    cueBall.vy = dirY * power;

    isMouseCharging = false;
    mousePower = 0;
    updatePowerBar(powerFillEl, 0);
  }

  /**
   * 移动端开始交互
   * @param {TouchEvent} event
   */
  function startTouchAim(event) {
    const cueBall = getCueBall(balls);

    if (!cueBall || cueBall.isPocketed) {
      return;
    }

    if (!areAllBallsStopped(balls)) {
      return;
    }

    const point = getCanvasPoint(event, canvas);
    if (!point) {
      return;
    }

    touchStartPoint = point;
    touchCurrentPoint = point;
    touchPower = 0;
    isTouchAiming = true;

    updateTouchAimAngle(touchStartPoint);
    updatePowerBar(powerFillEl, touchPower);
  }

  /**
   * 移动端滑动时：
   * - 方向由触摸起始点决定
   * - 力度由拖拽距离决定
   *
   * @param {TouchEvent} event
   */
  function moveTouchAim(event) {
    if (!isTouchAiming) {
      return;
    }

    const cueBall = getCueBall(balls);
    if (!cueBall || cueBall.isPocketed) {
      return;
    }

    const point = getCanvasPoint(event, canvas);
    if (!point || !touchStartPoint) {
      return;
    }

    touchCurrentPoint = point;

    // 方向固定为：起始触摸点 -> 母球
    updateTouchAimAngle(touchStartPoint);

    // 力度 = 当前触点相对起始点的拖拽距离
    const dragDx = point.x - touchStartPoint.x;
    const dragDy = point.y - touchStartPoint.y;
    const dragDistance = Math.hypot(dragDx, dragDy);

    // 以约 160px 拖拽距离映射到满力
    touchPower = Math.min(MAX_POWER, (dragDistance / 160) * MAX_POWER);
    updatePowerBar(powerFillEl, touchPower);
  }

  /**
   * 移动端结束击球
   * @param {TouchEvent} event
   */
  function releaseTouchShot(event) {
    if (!isTouchAiming) {
      return;
    }

    const cueBall = getCueBall(balls);
    if (!cueBall || cueBall.isPocketed) {
      isTouchAiming = false;
      touchPower = 0;
      touchStartPoint = null;
      touchCurrentPoint = null;
      updatePowerBar(powerFillEl, 0);
      return;
    }

    const point = getCanvasPoint(event, canvas);
    if (point) {
      touchCurrentPoint = point;
    }

    if (touchStartPoint) {
      updateTouchAimAngle(touchStartPoint);
    }

    const dirX = Math.cos(aimAngle);
    const dirY = Math.sin(aimAngle);

    cueBall.vx = dirX * touchPower;
    cueBall.vy = dirY * touchPower;

    isTouchAiming = false;
    touchPower = 0;
    touchStartPoint = null;
    touchCurrentPoint = null;
    updatePowerBar(powerFillEl, 0);
  }

  /**
   * 取消移动端交互
   */
  function cancelTouchAim() {
    isTouchAiming = false;
    touchPower = 0;
    touchStartPoint = null;
    touchCurrentPoint = null;
    updatePowerBar(powerFillEl, 0);
  }

  // 桌面端事件
  canvas.addEventListener("mousemove", updateMouseAimAngle);
  canvas.addEventListener("mousedown", startMouseCharge);
  window.addEventListener("mouseup", releaseMouseShot);

  // 移动端事件
  canvas.addEventListener(
    "touchstart",
    (event) => {
      event.preventDefault();
      startTouchAim(event);
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchmove",
    (event) => {
      event.preventDefault();
      moveTouchAim(event);
    },
    { passive: false }
  );

  window.addEventListener(
    "touchend",
    (event) => {
      event.preventDefault();
      releaseTouchShot(event);
    },
    { passive: false }
  );

  window.addEventListener(
    "touchcancel",
    (event) => {
      event.preventDefault();
      cancelTouchAim();
    },
    { passive: false }
  );

  /**
   * 每帧绘制瞄准线与球杆
   */
  function drawCue() {
    const cueBall = getCueBall(balls);

    if (!cueBall || cueBall.isPocketed) {
      updatePowerBar(powerFillEl, 0);
      return;
    }

    // 球在运动时不显示球杆与瞄准线
    if (!areAllBallsStopped(balls)) {
      updatePowerBar(powerFillEl, 0);
      return;
    }

    // 桌面端按住时，按时间累加力度
    if (isMouseCharging) {
      const elapsed = performance.now() - mouseChargeStartTime;
      const ratio = Math.min(1, elapsed / FULL_CHARGE_TIME);
      mousePower = MAX_POWER * ratio;
      updatePowerBar(powerFillEl, mousePower);
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
    const currentPower = getCurrentPower();
    const chargeRatio = currentPower / MAX_POWER;
    const pullBack = isCharging() ? chargeRatio * CUE_PULLBACK_MAX : 0;

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
