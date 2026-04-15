import {
  TABLE_WIDTH,
  TABLE_HEIGHT,
  TABLE_PADDING,
  BALL_RADIUS,
  POCKETS,
  POCKET_RADIUS
} from "./constants.js";

/**
 * 球杆系统配置
 */
const MAX_POWER = 25;
const DEFAULT_MOBILE_POWER = 12;
const FULL_CHARGE_TIME = 1200; // 桌面端按住约 1.2 秒充满
const CUE_LENGTH = 150;
const CUE_BASE_OFFSET = BALL_RADIUS + 14;
const CUE_PULLBACK_MAX = 28;

// 移动端：球桌区域水平滑动旋转灵敏度（弧度 / px）
const MOBILE_AIM_ROTATION_SPEED = 0.015;
// 移动端：右侧微调条灵敏度（弧度 / px）
const MOBILE_FINE_TUNE_SPEED = 0.002;
// 移动端：tap 判定阈值
const MOBILE_TAP_THRESHOLD = 10;

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
 * 计算一条射线到库边的距离
 * inset=0 表示台面边缘
 * inset=BALL_RADIUS 表示球心运动可达边界
 *
 * @param {number} originX
 * @param {number} originY
 * @param {number} dirX
 * @param {number} dirY
 * @param {number} inset
 * @returns {number}
 */
function getWallDistanceForRay(originX, originY, dirX, dirY, inset = 0) {
  const minX = TABLE_PADDING + inset;
  const maxX = TABLE_WIDTH - TABLE_PADDING - inset;
  const minY = TABLE_PADDING + inset;
  const maxY = TABLE_HEIGHT - TABLE_PADDING - inset;

  let tMin = Infinity;

  if (dirX > 0) {
    tMin = Math.min(tMin, (maxX - originX) / dirX);
  } else if (dirX < 0) {
    tMin = Math.min(tMin, (minX - originX) / dirX);
  }

  if (dirY > 0) {
    tMin = Math.min(tMin, (maxY - originY) / dirY);
  } else if (dirY < 0) {
    tMin = Math.min(tMin, (minY - originY) / dirY);
  }

  return tMin;
}

/**
 * 射线与圆的最近正向交点距离
 * 若无交点，返回 Infinity
 *
 * @param {number} originX
 * @param {number} originY
 * @param {number} dirX
 * @param {number} dirY
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} radius
 * @returns {number}
 */
function getRayCircleIntersectionDistance(
  originX,
  originY,
  dirX,
  dirY,
  centerX,
  centerY,
  radius
) {
  const ocX = originX - centerX;
  const ocY = originY - centerY;

  const b = 2 * (ocX * dirX + ocY * dirY);
  const c = ocX * ocX + ocY * ocY - radius * radius;
  const discriminant = b * b - 4 * c;

  if (discriminant < 0) {
    return Infinity;
  }

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const t1 = (-b - sqrtDiscriminant) / 2;
  const t2 = (-b + sqrtDiscriminant) / 2;

  if (t1 > 0) {
    return t1;
  }

  if (t2 > 0) {
    return t2;
  }

  return Infinity;
}

/**
 * 计算某条预测线的终点
 * - 默认到库边
 * - allowPockets=true 时，若先遇到袋口则停在袋口
 *
 * @param {number} originX
 * @param {number} originY
 * @param {number} dirX
 * @param {number} dirY
 * @param {{ inset?: number, allowPockets?: boolean }} options
 * @returns {{ x: number, y: number, distance: number }}
 */
function getTrajectoryStopPoint(
  originX,
  originY,
  dirX,
  dirY,
  options = {}
) {
  const inset = options.inset ?? BALL_RADIUS;
  const allowPockets = options.allowPockets ?? false;

  let nearestDistance = getWallDistanceForRay(
    originX,
    originY,
    dirX,
    dirY,
    inset
  );

  if (allowPockets) {
    POCKETS.forEach((pocket) => {
      const pocketDistance = getRayCircleIntersectionDistance(
        originX,
        originY,
        dirX,
        dirY,
        pocket.x,
        pocket.y,
        POCKET_RADIUS
      );

      if (pocketDistance > 0 && pocketDistance < nearestDistance) {
        nearestDistance = pocketDistance;
      }
    });
  }

  return {
    x: originX + dirX * nearestDistance,
    y: originY + dirY * nearestDistance,
    distance: nearestDistance
  };
}

/**
 * 计算母球瞄准的首碰信息
 * - 保留现有瞄准线逻辑：到第一颗球或到库边
 * - 若碰到球，返回 ghost ball 位置和目标球
 *
 * @param {Object} cueBall
 * @param {Array<Object>} balls
 * @param {number} angle
 * @returns {{
 *   endX: number,
 *   endY: number,
 *   dirX: number,
 *   dirY: number,
 *   hitBall: Object | null,
 *   ghostX: number | null,
 *   ghostY: number | null
 * }}
 */
function getAimCollisionInfo(cueBall, balls, angle) {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);

  const wallDistance = getWallDistanceForRay(
    cueBall.x,
    cueBall.y,
    dirX,
    dirY,
    0
  );

  let nearestDistance = wallDistance;
  let hitBall = null;

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
      hitBall = ball;
    }
  });

  const endX = cueBall.x + dirX * nearestDistance;
  const endY = cueBall.y + dirY * nearestDistance;

  return {
    endX,
    endY,
    dirX,
    dirY,
    hitBall,
    ghostX: hitBall ? endX : null,
    ghostY: hitBall ? endY : null
  };
}

/**
 * 通过 clientX 判断触点起始区域
 * @param {number} clientX
 * @param {HTMLElement} leftBarEl
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} rightBarEl
 * @returns {'left' | 'canvas' | 'right' | null}
 */
function getTouchZoneFromClientX(clientX, leftBarEl, canvas, rightBarEl) {
  const leftRect = leftBarEl.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const rightRect = rightBarEl.getBoundingClientRect();

  if (clientX >= leftRect.left && clientX <= leftRect.right) {
    return "left";
  }

  if (clientX >= canvasRect.left && clientX <= canvasRect.right) {
    return "canvas";
  }

  if (clientX >= rightRect.left && clientX <= rightRect.right) {
    return "right";
  }

  return null;
}

/**
 * 从 touchList 中取指定 identifier 的 touch
 * @param {TouchList} touchList
 * @param {number} identifier
 * @returns {Touch | null}
 */
function findTouchById(touchList, identifier) {
  for (let i = 0; i < touchList.length; i += 1) {
    if (touchList[i].identifier === identifier) {
      return touchList[i];
    }
  }

  return null;
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

  // 移动端锁定力度：不会自动归零
  let mobileLockedPower = DEFAULT_MOBILE_POWER;

  // 移动端当前手势会话
  let activeTouchId = null;
  let activeTouchZone = null; // left | canvas | right | ballInHand
  let touchStartClientX = 0;
  let touchStartClientY = 0;
  let touchStartAngle = 0;
  let draggingBallInHand = false;

  // 自由球手摆
  let ballInHandActive = false;

  // 总开关
  let interactionEnabled = true;

  const powerFillEl = document.querySelector(".power-fill");

  // -------------------------
  // 创建左右侧移动端控制条
  // -------------------------

  const leftBarEl = document.createElement("div");
  const leftBarFillEl = document.createElement("div");
  const leftBarLabelEl = document.createElement("div");

  leftBarEl.id = "mobilePowerBar";
  leftBarEl.style.position = "fixed";
  leftBarEl.style.width = "40px";
  leftBarEl.style.borderRadius = "12px";
  leftBarEl.style.background = "rgba(255,255,255,0.08)";
  leftBarEl.style.border = "1px solid rgba(255,255,255,0.16)";
  leftBarEl.style.overflow = "hidden";
  leftBarEl.style.zIndex = "20";
  leftBarEl.style.touchAction = "none";
  leftBarEl.style.userSelect = "none";
  leftBarEl.style.webkitUserSelect = "none";

  leftBarFillEl.style.position = "absolute";
  leftBarFillEl.style.left = "0";
  leftBarFillEl.style.right = "0";
  leftBarFillEl.style.bottom = "0";
  leftBarFillEl.style.height = "0%";
  leftBarFillEl.style.background =
    "linear-gradient(180deg, rgba(255,255,255,0.3), rgba(255,255,255,0.75))";

  leftBarLabelEl.textContent = "力度";
  leftBarLabelEl.style.position = "absolute";
  leftBarLabelEl.style.top = "8px";
  leftBarLabelEl.style.left = "50%";
  leftBarLabelEl.style.transform = "translateX(-50%)";
  leftBarLabelEl.style.fontSize = "12px";
  leftBarLabelEl.style.color = "#fff";
  leftBarLabelEl.style.pointerEvents = "none";
  leftBarLabelEl.style.writingMode = "vertical-rl";
  leftBarLabelEl.style.textOrientation = "upright";

  leftBarEl.appendChild(leftBarFillEl);
  leftBarEl.appendChild(leftBarLabelEl);

  const rightBarEl = document.createElement("div");
  const rightBarGuideEl = document.createElement("div");
  const rightBarLabelEl = document.createElement("div");

  rightBarEl.id = "mobileFineTuneBar";
  rightBarEl.style.position = "fixed";
  rightBarEl.style.width = "40px";
  rightBarEl.style.borderRadius = "12px";
  rightBarEl.style.background = "rgba(255,255,255,0.08)";
  rightBarEl.style.border = "1px solid rgba(255,255,255,0.16)";
  rightBarEl.style.overflow = "hidden";
  rightBarEl.style.zIndex = "20";
  rightBarEl.style.touchAction = "none";
  rightBarEl.style.userSelect = "none";
  rightBarEl.style.webkitUserSelect = "none";

  rightBarGuideEl.style.position = "absolute";
  rightBarGuideEl.style.left = "50%";
  rightBarGuideEl.style.top = "10%";
  rightBarGuideEl.style.bottom = "10%";
  rightBarGuideEl.style.width = "2px";
  rightBarGuideEl.style.transform = "translateX(-50%)";
  rightBarGuideEl.style.background = "rgba(255,255,255,0.35)";

  rightBarLabelEl.textContent = "微调";
  rightBarLabelEl.style.position = "absolute";
  rightBarLabelEl.style.top = "8px";
  rightBarLabelEl.style.left = "50%";
  rightBarLabelEl.style.transform = "translateX(-50%)";
  rightBarLabelEl.style.fontSize = "12px";
  rightBarLabelEl.style.color = "#fff";
  rightBarLabelEl.style.pointerEvents = "none";
  rightBarLabelEl.style.writingMode = "vertical-rl";
  rightBarLabelEl.style.textOrientation = "upright";

  rightBarEl.appendChild(rightBarGuideEl);
  rightBarEl.appendChild(rightBarLabelEl);

  document.body.appendChild(leftBarEl);
  document.body.appendChild(rightBarEl);

  /**
   * 同步左右控制条位置
   */
  function syncTouchUILayout() {
    const rect = canvas.getBoundingClientRect();
    const gap = 10;
    const width = 40;
    const left = Math.max(8, rect.left - width - gap);
    const right = Math.min(window.innerWidth - width - 8, rect.right + gap);

    leftBarEl.style.left = `${left}px`;
    leftBarEl.style.top = `${rect.top}px`;
    leftBarEl.style.height = `${rect.height}px`;

    rightBarEl.style.left = `${right}px`;
    rightBarEl.style.top = `${rect.top}px`;
    rightBarEl.style.height = `${rect.height}px`;
  }

  /**
   * 更新移动端左侧力度条视觉
   */
  function updateMobilePowerBarUI() {
    const percent = (mobileLockedPower / MAX_POWER) * 100;
    leftBarFillEl.style.height = `${percent}%`;
  }

  /**
   * 更新交互显隐
   */
  function updateTouchUIVisibility() {
    const display = interactionEnabled ? "block" : "none";
    leftBarEl.style.display = display;
    rightBarEl.style.display = display;
  }

  /**
   * 清空桌面端蓄力状态
   */
  function clearMouseChargeState() {
    isMouseCharging = false;
    mouseChargeStartTime = 0;
    mousePower = 0;
  }

  /**
   * 清空移动端手势会话
   */
  function clearMobileTouchSession() {
    activeTouchId = null;
    activeTouchZone = null;
    touchStartClientX = 0;
    touchStartClientY = 0;
    touchStartAngle = 0;
    draggingBallInHand = false;
  }

  /**
   * 清空全部临时状态
   */
  function clearAllTemporaryState() {
    clearMouseChargeState();
    clearMobileTouchSession();
  }

  /**
   * 当前是否正在蓄力
   * @returns {boolean}
   */
  function isCharging() {
    return isMouseCharging;
  }

  /**
   * 当前桌面端绘制用力度
   * @returns {number}
   */
  function getCurrentPower() {
    if (isMouseCharging) {
      return mousePower;
    }

    return 0;
  }

  /**
   * 当前预测用力度
   * 桌面端按住时使用实时力度；否则用移动端锁定力度
   * @returns {number}
   */
  function getPreviewPower() {
    if (isMouseCharging) {
      return mousePower;
    }

    return mobileLockedPower;
  }

  /**
   * 同步底部力度条
   */
  function syncBottomPowerBar() {
    if (isMouseCharging) {
      updatePowerBar(powerFillEl, mousePower);
      return;
    }

    updatePowerBar(powerFillEl, mobileLockedPower);
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
   * 用当前锁定力度出杆（移动端）
   */
  function shootWithLockedPower() {
    const cueBall = getCueBall(balls);
    if (!cueBall || cueBall.isPocketed) {
      return;
    }

    const dirX = Math.cos(aimAngle);
    const dirY = Math.sin(aimAngle);

    cueBall.vx = dirX * mobileLockedPower;
    cueBall.vy = dirY * mobileLockedPower;
  }

  /**
   * 启用自由球手摆
   */
  function activateBallInHand() {
    const cueBall = getCueBall(balls);
    if (!cueBall) {
      return;
    }

    clearAllTemporaryState();

    const startPos = findBallInHandStartPosition(balls);
    cueBall.x = startPos.x;
    cueBall.y = startPos.y;
    cueBall.vx = 0;
    cueBall.vy = 0;
    cueBall.isPocketed = false;

    ballInHandActive = true;
  }

  /**
   * 确认自由球摆放
   */
  function confirmBallInHand() {
    ballInHandActive = false;
    draggingBallInHand = false;
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
    syncBottomPowerBar();
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
      clearMouseChargeState();
      syncBottomPowerBar();
      return;
    }

    updateMouseAimAngle(event);

    const power = mousePower;
    const dirX = Math.cos(aimAngle);
    const dirY = Math.sin(aimAngle);

    cueBall.vx = dirX * power;
    cueBall.vy = dirY * power;

    clearMouseChargeState();
    syncBottomPowerBar();
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
      clearAllTemporaryState();
    }

    updateTouchUIVisibility();
    syncBottomPowerBar();
  }

  /**
   * 重置 cue 状态
   */
  function reset() {
    aimAngle = 0;
    ballInHandActive = false;
    draggingBallInHand = false;
    mobileLockedPower = DEFAULT_MOBILE_POWER;
    clearAllTemporaryState();
    updateMobilePowerBarUI();
    syncBottomPowerBar();
    syncTouchUILayout();
  }

  /**
   * 根据左侧力度条中的触点位置设置锁定力度
   * 顶部 = MAX_POWER，底部 = 0
   * @param {Touch} touch
   */
  function updateLockedPowerFromTouch(touch) {
    const rect = leftBarEl.getBoundingClientRect();
    const relativeY = clamp(touch.clientY - rect.top, 0, rect.height);
    const ratio = 1 - relativeY / rect.height;

    mobileLockedPower = clamp(ratio * MAX_POWER, 0, MAX_POWER);
    updateMobilePowerBarUI();
    syncBottomPowerBar();
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
      handleBallInHandPointerUp();
      return;
    }

    releaseMouseShot(event);
  });

  // -------------------------
  // 移动端：三个区域独立
  // -------------------------

  function handleTouchStart(event) {
    if (!interactionEnabled) {
      return;
    }

    event.preventDefault();

    if (activeTouchId != null || event.changedTouches.length === 0) {
      return;
    }

    const touch = event.changedTouches[0];
    const zone = getTouchZoneFromClientX(
      touch.clientX,
      leftBarEl,
      canvas,
      rightBarEl
    );

    if (!zone) {
      return;
    }

    if (ballInHandActive) {
      if (zone !== "canvas") {
        return;
      }

      activeTouchId = touch.identifier;
      activeTouchZone = "ballInHand";
      handleBallInHandPointerDown({
        touches: [touch],
        changedTouches: [touch]
      });
      return;
    }

    const cueBall = getCueBall(balls);
    if (!cueBall || cueBall.isPocketed || !areAllBallsStopped(balls)) {
      return;
    }

    activeTouchId = touch.identifier;
    activeTouchZone = zone;
    touchStartClientX = touch.clientX;
    touchStartClientY = touch.clientY;
    touchStartAngle = aimAngle;

    if (zone === "left") {
      updateLockedPowerFromTouch(touch);
    }
  }

  function handleTouchMove(event) {
    if (!interactionEnabled || activeTouchId == null) {
      return;
    }

    const touch = findTouchById(event.touches, activeTouchId);
    if (!touch) {
      return;
    }

    event.preventDefault();

    if (activeTouchZone === "ballInHand") {
      handleBallInHandPointerMove({
        touches: [touch],
        changedTouches: [touch]
      });
      return;
    }

    if (activeTouchZone === "left") {
      updateLockedPowerFromTouch(touch);
      return;
    }

    if (activeTouchZone === "right") {
      const deltaY = touch.clientY - touchStartClientY;
      aimAngle = touchStartAngle + deltaY * MOBILE_FINE_TUNE_SPEED;
      return;
    }

    if (activeTouchZone === "canvas") {
      const deltaX = touch.clientX - touchStartClientX;
      aimAngle = touchStartAngle + deltaX * MOBILE_AIM_ROTATION_SPEED;
    }
  }

  function handleTouchEnd(event) {
    if (!interactionEnabled || activeTouchId == null) {
      return;
    }

    const touch = findTouchById(event.changedTouches, activeTouchId);
    if (!touch) {
      return;
    }

    event.preventDefault();

    if (activeTouchZone === "ballInHand") {
      handleBallInHandPointerUp();
      clearMobileTouchSession();
      return;
    }

    if (activeTouchZone === "canvas") {
      const dx = touch.clientX - touchStartClientX;
      const dy = touch.clientY - touchStartClientY;
      const distance = Math.hypot(dx, dy);

      // 单指轻触：按当前锁定力度出杆
      if (distance < MOBILE_TAP_THRESHOLD) {
        shootWithLockedPower();
      }
    }

    clearMobileTouchSession();
    syncBottomPowerBar();
  }

  function handleTouchCancel(event) {
    if (!interactionEnabled || activeTouchId == null) {
      return;
    }

    const touch = findTouchById(event.changedTouches, activeTouchId);
    if (!touch) {
      return;
    }

    event.preventDefault();

    if (activeTouchZone === "ballInHand") {
      handleBallInHandPointerUp();
    }

    clearMobileTouchSession();
    syncBottomPowerBar();
  }

  canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
  leftBarEl.addEventListener("touchstart", handleTouchStart, { passive: false });
  rightBarEl.addEventListener("touchstart", handleTouchStart, { passive: false });

  window.addEventListener("touchmove", handleTouchMove, { passive: false });
  window.addEventListener("touchend", handleTouchEnd, { passive: false });
  window.addEventListener("touchcancel", handleTouchCancel, { passive: false });

  window.addEventListener("resize", syncTouchUILayout);
  window.addEventListener("scroll", syncTouchUILayout, { passive: true });

  /**
   * 每帧绘制瞄准线与球杆 / 自由球高亮
   */
  function drawCue() {
    const cueBall = getCueBall(balls);

    syncTouchUILayout();
    updateMobilePowerBarUI();

    if (!cueBall || cueBall.isPocketed || !interactionEnabled) {
      syncBottomPowerBar();
      return;
    }

    if (ballInHandActive) {
      syncBottomPowerBar();

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
      syncBottomPowerBar();
      return;
    }

    // 桌面端按住时按时间累加力度
    if (isMouseCharging) {
      const elapsed = performance.now() - mouseChargeStartTime;
      const ratio = Math.min(1, elapsed / FULL_CHARGE_TIME);
      mousePower = MAX_POWER * ratio;
    }

    syncBottomPowerBar();

    const currentPower = getCurrentPower();
    const previewPower = getPreviewPower();

    // 计算首碰信息
    const collisionInfo = getAimCollisionInfo(cueBall, balls, aimAngle);
    const {
      dirX,
      dirY,
      endX,
      endY,
      hitBall,
      ghostX,
      ghostY
    } = collisionInfo;

    // -------- 第一条线：母球运动轨迹线（保留原逻辑）--------
    const aimStartX = cueBall.x + dirX * (cueBall.radius + 2);
    const aimStartY = cueBall.y + dirY * (cueBall.radius + 2);

    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([10, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.moveTo(aimStartX, aimStartY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.restore();

    // -------- 新增：碰撞预测辅助线 --------
    if (hitBall && ghostX != null && ghostY != null) {
      const normalDX = hitBall.x - ghostX;
      const normalDY = hitBall.y - ghostY;
      const normalLength = Math.hypot(normalDX, normalDY);

      if (normalLength > 0.0001) {
        const nx = normalDX / normalLength;
        const ny = normalDY / normalLength;

        // 1) 幽灵球
        ctx.save();
        ctx.beginPath();
        ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.arc(ghostX, ghostY, cueBall.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // 2) 目标球运动预测线
        // 先画幽灵球圆心 -> 目标球圆心
        ctx.save();
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255, 220, 50, 0.6)";
        ctx.moveTo(ghostX, ghostY);
        ctx.lineTo(hitBall.x, hitBall.y);
        ctx.stroke();

        const targetStop = getTrajectoryStopPoint(
          hitBall.x,
          hitBall.y,
          nx,
          ny,
          {
            inset: BALL_RADIUS,
            allowPockets: true
          }
        );

        ctx.beginPath();
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255, 220, 50, 0.6)";
        ctx.moveTo(hitBall.x, hitBall.y);
        ctx.lineTo(targetStop.x, targetStop.y);
        ctx.stroke();
        ctx.restore();

        // 3) 母球碰撞后反弹预测线
        // 等质量弹性碰撞下，母球只保留切向分量
        // 切向方向为法线的垂线方向
        if (previewPower > 0) {
          const tangentAX = -ny;
          const tangentAY = nx;
          const tangentDot = dirX * tangentAX + dirY * tangentAY;

          if (Math.abs(tangentDot) > 0.0001) {
            const tx = tangentDot >= 0 ? tangentAX : -tangentAX;
            const ty = tangentDot >= 0 ? tangentAY : -tangentAY;

            const cueStop = getTrajectoryStopPoint(
              ghostX,
              ghostY,
              tx,
              ty,
              {
                inset: BALL_RADIUS,
                allowPockets: false
              }
            );

            ctx.save();
            ctx.beginPath();
            ctx.setLineDash([8, 6]);
            ctx.lineWidth = 2;
            ctx.strokeStyle = "rgba(100, 180, 255, 0.6)";
            ctx.moveTo(ghostX, ghostY);
            ctx.lineTo(cueStop.x, cueStop.y);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    }

    // -------- 球杆 --------
    // 桌面端保持原逻辑：按住才后拉
    // 移动端不后拉，力度由左条锁定，tap 出杆
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

  // 初始化
  syncTouchUILayout();
  updateMobilePowerBarUI();
  updateTouchUIVisibility();
  syncBottomPowerBar();

  return {
    drawCue,
    activateBallInHand,
    setInteractionEnabled,
    reset
  };
}
