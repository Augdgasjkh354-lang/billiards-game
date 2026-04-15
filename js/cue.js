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
 * 限制数值范围
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * 球杆可移动的厨房区范围
 * 中式黑八：限制在左半边
 */
function getBallInHandBounds() {
  return {
    minX: TABLE_PADDING + BALL_RADIUS,
    maxX: TABLE_WIDTH / 2 - BALL_RADIUS,
    minY: TABLE_PADDING + BALL_RADIUS,
    maxY: TABLE_HEIGHT - TABLE_PADDING - BALL_RADIUS
  };
}

/**
 * 判断一个点是否点中了球
 * @param {{ x: number, y: number }} point
 * @param {Object} ball
 * @returns {boolean}
 */
function isPointOnBall(point, ball) {
  return Math.hypot(point.x - ball.x, point.y - ball.y) <= ball.radius + 6;
}

/**
 * 判断母球摆放位置是否合法
 * - 必须在厨房区
 * - 不能与其他未进袋球重叠
 *
 * @param {number} x
 * @param {number} y
 * @param {Array<Object>} balls
 * @returns {boolean}
 */
function isValidBallInHandPosition(x, y, balls) {
  const bounds = getBallInHandBounds();

  if (
    x < bounds.minX ||
    x > bounds.maxX ||
    y < bounds.minY ||
    y > bounds.maxY
  ) {
    return false;
  }

  return balls.every((ball) => {
    if (ball.id === 0 || ball.isPocketed) {
      return true;
    }

    const distance = Math.hypot(ball.x - x, ball.y - y);
    return distance >= BALL_RADIUS + ball.radius + 0.5;
  });
}

/**
 * 寻找自由球初始摆放位置
 * 优先厨房区中心，若重叠则扫描附近合法位置
 *
 * @param {Array<Object>} balls
 * @returns {{ x: number, y: number }}
 */
function findBallInHandStartPosition(balls) {
  const bounds = getBallInHandBounds();

  const preferred = {
    x: TABLE_PADDING + (TABLE_WIDTH - TABLE_PADDING * 2) * 0.25,
    y: TABLE_PADDING + (TABLE_HEIGHT - TABLE_PADDING * 2) / 2
  };

  if (isValidBallInHandPosition(preferred.x, preferred.y, balls)) {
    return preferred;
  }

  let best = null;
  let bestDistanceSq = Infinity;

  for (let x = bounds.minX; x <= bounds.maxX; x += 4) {
    for (let y = bounds.minY; y <= bounds.maxY; y += 4) {
      if (!isValidBallInHandPosition(x, y, balls)) {
        continue;
      }

      const dx = x - preferred.x;
      const dy = y - preferred.y;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        best = { x, y };
      }
    }
  }

  return best || preferred;
}

/**
 * 尝试更新母球手摆位置
 *
 * @param {{ x: number, y: number }} point
 * @param {Array<Object>} balls
 */
function tryMoveCueBallToPoint(point, balls) {
  const cueBall = getCueBall(balls);
  if (!cueBall) {
    return;
  }

  const bounds = getBallInHandBounds();
  const candidateX = clamp(point.x, bounds.minX, bounds.maxX);
  const candidateY = clamp(point.y, bounds.minY, bounds.maxY);

  if (!isValidBallInHandPosition(candidateX, candidateY, balls)) {
    return;
  }

  cueBall.x = candidateX;
  cueBall.y = candidateY;
  cueBall.vx = 0;
  cueBall.vy = 0;
  cueBall.isPocketed = false;
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
 * 初始化球杆系统
 * 返回：
 * - drawCue()：每帧绘制球杆和瞄准线
 * - activateBallInHand()：启用自由球手摆
 * - setInteractionEnabled(enabled)
 * - reset()
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

  // 自由球手摆状态
  let ballInHandActive = false;
  let draggingBallInHand = false;

  // 总开关（开始界面 / 结算界面时关闭）
  let interactionEnabled = true;

  const powerFillEl = document.querySelector(".power-fill");

  canvas.style.touchAction = "none";
  updatePowerBar(powerFillEl, 0);

  /**
   * 清空蓄力状态
   */
  function clearChargeState() {
    isMouseCharging = false;
    mouseChargeStartTime = 0;
    mousePower = 0;

    isTouchAiming = false;
    touchPower = 0;
    touchStartPoint = null;
    touchCurrentPoint = null;

    updatePowerBar(powerFillEl, 0);
  }

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
   * 移动端瞄准方向 = 从触摸起始点指向母球
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
   * 启用自由球手摆
   */
  function activateBallInHand() {
    const cueBall = getCueBall(balls);
    if (!cueBall) {
      return;
    }

    clearChargeState();

    const startPos = findBallInHandStartPosition(balls);
    cueBall.x = startPos.x;
    cueBall.y = startPos.y;
    cueBall.vx = 0;
    cueBall.vy = 0;
    cueBall.isPocketed = false;

    ballInHandActive = true;
    draggingBallInHand = false;
  }

  /**
   * 确认自由球摆放完成
   */
  function confirmBallInHand() {
    ballInHandActive = false;
    draggingBallInHand = false;
    updatePowerBar(powerFillEl, 0);
  }

  /**
   * 处理自由球按下
   * - 点中母球：开始拖动
   * - 点其他区域：确认摆放
   *
   * @param {MouseEvent | TouchEvent} event
   */
  function handleBallInHandPointerDown(event) {
    const cueBall = getCueBall(balls);
    if (!cueBall) {
      return;
    }

    const point = getCanvasPoint(event, canvas);
    if (!point) {
      return;
    }

    if (isPointOnBall(point, cueBall)) {
      draggingBallInHand = true;
      tryMoveCueBallToPoint(point, balls);
    } else {
      confirmBallInHand();
    }
  }

  /**
   * 处理自由球拖动
   * @param {MouseEvent | TouchEvent} event
   */
  function handleBallInHandPointerMove(event) {
    if (!draggingBallInHand) {
      return;
    }

    const point = getCanvasPoint(event, canvas);
    if (!point) {
      return;
    }

    tryMoveCueBallToPoint(point, balls);
  }

  /**
   * 处理自由球抬起
   */
  function handleBallInHandPointerUp() {
    draggingBallInHand = false;
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
      clearChargeState();
      return;
    }

    updateMouseAimAngle(event);

    const power = mousePower;
    const dirX = Math.cos(aimAngle);
    const dirY = Math.sin(aimAngle);

    cueBall.vx = dirX * power;
    cueBall.vy = dirY * power;

    clearChargeState();
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
   * 移动端滑动控制：
   * - 方向 = 起始触点指向母球
   * - 力度 = 当前拖拽距离
   *
   * @param {TouchEvent} event
   */
  function moveTouchAim(event) {
    if (!isTouchAiming) {
      return;
    }

    const point = getCanvasPoint(event, canvas);
    if (!point || !touchStartPoint) {
      return;
    }

    touchCurrentPoint = point;

    updateTouchAimAngle(touchStartPoint);

    const dragDx = point.x - touchStartPoint.x;
    const dragDy = point.y - touchStartPoint.y;
    const dragDistance = Math.hypot(dragDx, dragDy);

    touchPower = Math.min(MAX_POWER, (dragDistance / 160) * MAX_POWER);
    updatePowerBar(powerFillEl, touchPower);
  }

  /**
   * 移动端结束击球
   */
  function releaseTouchShot() {
    if (!isTouchAiming) {
      return;
    }

    const cueBall = getCueBall(balls);
    if (!cueBall || cueBall.isPocketed) {
      clearChargeState();
      return;
    }

    if (touchStartPoint) {
      updateTouchAimAngle(touchStartPoint);
    }

    const dirX = Math.cos(aimAngle);
    const dirY = Math.sin(aimAngle);

    cueBall.vx = dirX * touchPower;
    cueBall.vy = dirY * touchPower;

    clearChargeState();
  }

  /**
   * 取消移动端交互
   */
  function cancelTouchAim() {
    clearChargeState();
  }

  /**
   * 设置交互总开关
   * @param {boolean} enabled
   */
  function setInteractionEnabled(enabled) {
    interactionEnabled = enabled;

    if (!enabled) {
      ballInHandActive = false;
      draggingBallInHand = false;
      clearChargeState();
    }
  }

  /**
   * 重置 cue 状态
   */
  function reset() {
    aimAngle = 0;
    ballInHandActive = false;
    draggingBallInHand = false;
    clearChargeState();
  }

  // -------------------------
  // 事件绑定
  // -------------------------

  canvas.addEventListener("mousemove", (event) => {
    if (!interactionEnabled) {
      return;
    }

    if (ballInHandActive) {
      handleBallInHandPointerMove(event);
      return;
    }

    updateMouseAimAngle(event);
  });

  canvas.addEventListener("mousedown", (event) => {
    if (!interactionEnabled) {
      return;
    }

    if (ballInHandActive) {
      handleBallInHandPointerDown(event);
      return;
    }

    startMouseCharge(event);
  });

  window.addEventListener("mouseup", (event) => {
    if (!interactionEnabled) {
      return;
    }

    if (ballInHandActive) {
      handleBallInHandPointerUp(event);
      return;
    }

    releaseMouseShot(event);
  });

  canvas.addEventListener(
    "touchstart",
    (event) => {
      if (!interactionEnabled) {
        return;
      }

      event.preventDefault();

      if (ballInHandActive) {
        handleBallInHandPointerDown(event);
        return;
      }

      startTouchAim(event);
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchmove",
    (event) => {
      if (!interactionEnabled) {
        return;
      }

      event.preventDefault();

      if (ballInHandActive) {
        handleBallInHandPointerMove(event);
        return;
      }

      moveTouchAim(event);
    },
    { passive: false }
  );

  window.addEventListener(
    "touchend",
    (event) => {
      if (!interactionEnabled) {
        return;
      }

      event.preventDefault();

      if (ballInHandActive) {
        handleBallInHandPointerUp(event);
        return;
      }

      releaseTouchShot(event);
    },
    { passive: false }
  );

  window.addEventListener(
    "touchcancel",
    (event) => {
      if (!interactionEnabled) {
        return;
      }

      event.preventDefault();

      if (ballInHandActive) {
        handleBallInHandPointerUp(event);
        return;
      }

      cancelTouchAim();
    },
    { passive: false }
  );

  /**
   * 每帧绘制瞄准线与球杆 / 自由球高亮
   */
  function drawCue() {
    const cueBall = getCueBall(balls);

    if (!cueBall || cueBall.isPocketed || !interactionEnabled) {
      updatePowerBar(powerFillEl, 0);
      return;
    }

    if (ballInHandActive) {
      updatePowerBar(powerFillEl, 0);

      // 高亮厨房区分界线
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.moveTo(TABLE_WIDTH / 2, TABLE_PADDING);
      ctx.lineTo(TABLE_WIDTH / 2, TABLE_HEIGHT - TABLE_PADDING);
      ctx.stroke();

      // 高亮母球
      ctx.beginPath();
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.arc(cueBall.x, cueBall.y, cueBall.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      return;
    }

    // 球在运动时不显示球杆与瞄准线
    if (!areAllBallsStopped(balls)) {
      updatePowerBar(powerFillEl, 0);
      return;
    }

    // 桌面端按住时按时间累加力度
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

    ctx.beginPath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#d8c3a5";
    ctx.moveTo(cueNearX, cueNearY);
    ctx.lineTo(cueNearX + dirX * 12, cueNearY + dirY * 12);
    ctx.stroke();
    ctx.restore();
  }

  return {
    drawCue,
    activateBallInHand,
    setInteractionEnabled,
    reset
  };
}
