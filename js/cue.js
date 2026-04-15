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

// 移动端：单指水平滑动旋转灵敏度（弧度 / 像素）
const MOBILE_AIM_ROTATION_SPEED = 0.015;
// 移动端：垂直下拉多少像素视为满力
const MOBILE_CHARGE_FULL_DRAG = 160;

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
 * 获取多个触点的平均位置
 * @param {TouchEvent} event
 * @param {HTMLCanvasElement} canvas
 * @returns {{ x: number, y: number } | null}
 */
function getAverageTouchPoint(event, canvas) {
  if (!event.touches || event.touches.length === 0) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  let sumX = 0;
  let sumY = 0;

  for (let i = 0; i < event.touches.length; i += 1) {
    sumX += event.touches[i].clientX;
    sumY += event.touches[i].clientY;
  }

  const avgClientX = sumX / event.touches.length;
  const avgClientY = sumY / event.touches.length;

  return {
    x: (avgClientX - rect.left) * scaleX,
    y: (avgClientY - rect.top) * scaleY
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
 * 判断点是否在球上
 * @param {{ x: number, y: number }} point
 * @param {Object} ball
 * @returns {boolean}
 */
function isPointOnBall(point, ball) {
  return Math.hypot(point.x - ball.x, point.y - ball.y) <= ball.radius + 6;
}

/**
 * 自由球厨房区范围
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
 * 判断母球手摆位置是否合法
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
 * 尝试移动母球自由摆放位置
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
 * 判断触点是否在 canvas 右侧 1/3 区域
 * @param {{ x: number, y: number }} point
 * @returns {boolean}
 */
function isInMobileChargeZone(point) {
  return point.x >= TABLE_WIDTH * (2 / 3);
}

/**
 * 计算从母球出发，沿指定方向到达库边的距离
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
 * 计算瞄准线终点
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
 */
export function initCue(canvas, ctx, balls) {
  let aimAngle = 0;

  // 桌面端状态
  let isMouseCharging = false;
  let mouseChargeStartTime = 0;
  let mousePower = 0;

  // 移动端状态：两阶段
  // idle | aim | charge
  let mobileMode = "idle";

  // 旋转瞄准
  let mobileAimStartPoint = null;
  let mobileAimStartAngle = 0;

  // 拉杆蓄力
  let mobileChargeStartPoint = null;
  let mobilePower = 0;

  // 自由球手摆
  let ballInHandActive = false;
  let draggingBallInHand = false;

  // 总开关
  let interactionEnabled = true;

  const powerFillEl = document.querySelector(".power-fill");

  canvas.style.touchAction = "none";
  updatePowerBar(powerFillEl, 0);

  /**
   * 清空桌面端蓄力
   */
  function clearMouseChargeState() {
    isMouseCharging = false;
    mouseChargeStartTime = 0;
    mousePower = 0;
  }

  /**
   * 清空移动端状态
   */
  function clearMobileState() {
    mobileMode = "idle";
    mobileAimStartPoint = null;
    mobileAimStartAngle = 0;
    mobileChargeStartPoint = null;
    mobilePower = 0;
  }

  /**
   * 清空全部蓄力状态
   */
  function clearAllChargeState() {
    clearMouseChargeState();
    clearMobileState();
    updatePowerBar(powerFillEl, 0);
  }

  /**
   * 当前是否正在蓄力
   * @returns {boolean}
   */
  function isCharging() {
    return isMouseCharging || mobileMode === "charge";
  }

  /**
   * 当前绘制用力度
   * @returns {number}
   */
  function getCurrentPower() {
    if (isMouseCharging) {
      return mousePower;
    }

    if (mobileMode === "charge") {
      return mobilePower;
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
   * 开始移动端旋转瞄准
   * @param {TouchEvent} event
   */
  function startMobileAim(event) {
    const point = getCanvasPoint(event, canvas);
    if (!point) {
      return;
    }

    mobileMode = "aim";
    mobileAimStartPoint = point;
    mobileAimStartAngle = aimAngle;
    mobilePower = 0;
    updatePowerBar(powerFillEl, 0);
  }

  /**
   * 开始移动端拉杆蓄力
   * 支持：
   * - 双指任意位置
   * - 单指从右侧 1/3 区域开始
   *
   * @param {TouchEvent} event
   */
  function startMobileCharge(event) {
    const point =
      event.touches.length >= 2
        ? getAverageTouchPoint(event, canvas)
        : getCanvasPoint(event, canvas);

    if (!point) {
      return;
    }

    mobileMode = "charge";
    mobileChargeStartPoint = point;
    mobilePower = 0;
    updatePowerBar(powerFillEl, 0);
  }

  /**
   * 更新移动端旋转瞄准
   * 单指左右滑动，只旋转，不蓄力
   *
   * @param {TouchEvent} event
   */
  function updateMobileAim(event) {
    if (mobileMode !== "aim" || !mobileAimStartPoint) {
      return;
    }

    const point = getCanvasPoint(event, canvas);
    if (!point) {
      return;
    }

    const deltaX = point.x - mobileAimStartPoint.x;
    aimAngle = mobileAimStartAngle + deltaX * MOBILE_AIM_ROTATION_SPEED;
    mobilePower = 0;
    updatePowerBar(powerFillEl, 0);
  }

  /**
   * 更新移动端拉杆蓄力
   * 纵向向下拖动，力度增大
   *
   * @param {TouchEvent} event
   */
  function updateMobileCharge(event) {
    if (mobileMode !== "charge" || !mobileChargeStartPoint) {
      return;
    }

    const point =
      event.touches.length >= 2
        ? getAverageTouchPoint(event, canvas)
        : getCanvasPoint(event, canvas);

    if (!point) {
      return;
    }

    const dragY = point.y - mobileChargeStartPoint.y;
    mobilePower = clamp(
      (dragY / MOBILE_CHARGE_FULL_DRAG) * MAX_POWER,
      0,
      MAX_POWER
    );

    updatePowerBar(powerFillEl, mobilePower);
  }

  /**
   * 执行移动端击球
   */
  function shootMobile() {
    if (mobileMode !== "charge") {
      clearMobileState();
      updatePowerBar(powerFillEl, 0);
      return;
    }

    const cueBall = getCueBall(balls);
    if (!cueBall || cueBall.isPocketed) {
      clearMobileState();
      updatePowerBar(powerFillEl, 0);
      return;
    }

    const dirX = Math.cos(aimAngle);
    const dirY = Math.sin(aimAngle);

    cueBall.vx = dirX * mobilePower;
    cueBall.vy = dirY * mobilePower;

    clearMobileState();
    updatePowerBar(powerFillEl, 0);
  }

  /**
   * 启用自由球手摆
   */
  function activateBallInHand() {
    const cueBall = getCueBall(balls);
    if (!cueBall) {
      return;
    }

    clearAllChargeState();

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
   * 确认自由球摆放
   */
  function confirmBallInHand() {
    ballInHandActive = false;
    draggingBallInHand = false;
    updatePowerBar(powerFillEl, 0);
  }

  /**
   * 处理自由球按下
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
      clearAllChargeState();
      return;
    }

    updateMouseAimAngle(event);

    const power = mousePower;
    const dirX = Math.cos(aimAngle);
    const dirY = Math.sin(aimAngle);

    cueBall.vx = dirX * power;
    cueBall.vy = dirY * power;

    clearAllChargeState();
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
      clearAllChargeState();
    }
  }

  /**
   * 重置 cue 状态
   */
  function reset() {
    aimAngle = 0;
    ballInHandActive = false;
    draggingBallInHand = false;
    clearAllChargeState();
  }

  // -------------------------
  // 桌面端事件
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

  // -------------------------
  // 移动端事件
  // -------------------------

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

      const cueBall = getCueBall(balls);
      if (!cueBall || cueBall.isPocketed || !areAllBallsStopped(balls)) {
        return;
      }

      // 双指直接进入拉杆蓄力
      if (event.touches.length >= 2) {
        startMobileCharge(event);
        return;
      }

      // 单指：
      // - 在右侧 1/3 区域开始 => 进入拉杆蓄力
      // - 其他区域 => 进入旋转瞄准
      const point = getCanvasPoint(event, canvas);
      if (!point) {
        return;
      }

      if (isInMobileChargeZone(point)) {
        startMobileCharge(event);
      } else {
        startMobileAim(event);
      }
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

      // 旋转中如果加了第二根手指，切换到蓄力
      if (mobileMode === "aim" && event.touches.length >= 2) {
        startMobileCharge(event);
        return;
      }

      if (mobileMode === "aim") {
        updateMobileAim(event);
        return;
      }

      if (mobileMode === "charge") {
        updateMobileCharge(event);
      }
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
        handleBallInHandPointerUp();
        return;
      }

      // 只有拉杆蓄力阶段才会松手击球
      if (mobileMode === "charge") {
        shootMobile();
        return;
      }

      // 旋转瞄准松手只结束旋转，不出杆
      if (mobileMode === "aim") {
        clearMobileState();
        updatePowerBar(powerFillEl, 0);
      }
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
        handleBallInHandPointerUp();
        return;
      }

      clearMobileState();
      updatePowerBar(powerFillEl, 0);
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

      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.moveTo(TABLE_WIDTH / 2, TABLE_PADDING);
      ctx.lineTo(TABLE_WIDTH / 2, TABLE_HEIGHT - TABLE_PADDING);
      ctx.stroke();

      ctx.beginPath();
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.arc(cueBall.x, cueBall.y, cueBall.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      return;
    }

    if (!areAllBallsStopped(balls)) {
      updatePowerBar(powerFillEl, 0);
      return;
    }

    // 桌面端：按住时按时间累加力度
    if (isMouseCharging) {
      const elapsed = performance.now() - mouseChargeStartTime;
      const ratio = Math.min(1, elapsed / FULL_CHARGE_TIME);
      mousePower = MAX_POWER * ratio;
      updatePowerBar(powerFillEl, mousePower);
    }

    const dirX = Math.cos(aimAngle);
    const dirY = Math.sin(aimAngle);

    // -------- 瞄准线始终显示 --------
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
