/**
 * 规则层
 * 支持：
 * - 8ball：黑八规则（当前先按中式/简化国际共用逻辑）
 * - practice：单人练习
 */

const state = {
  gameMode: "8ball",
  currentPlayer: 1,
  player1Group: null,
  player2Group: null,
  groupAssigned: false,
  lastMessage: "游戏开始，玩家 1 开球。"
};

/**
 * 初始化规则系统
 * @param {'8ball' | 'practice'} mode
 */
export function initRules(mode = "8ball") {
  state.gameMode = mode;
  state.currentPlayer = 1;
  state.player1Group = null;
  state.player2Group = null;
  state.groupAssigned = false;
  state.lastMessage =
    mode === "practice"
      ? "练习模式：自由击球。"
      : "黑八模式：玩家 1 开球。";
}

/**
 * 获取当前规则状态
 * @returns {object}
 */
export function getGameState() {
  return {
    gameMode: state.gameMode,
    currentPlayer: state.currentPlayer,
    player1Group: state.player1Group,
    player2Group: state.player2Group,
    groupAssigned: state.groupAssigned,
    lastMessage: state.lastMessage
  };
}

/**
 * 判断球 id 所属组别
 * @param {number} id
 * @returns {'solid' | 'stripe' | 'eight' | 'cue' | null}
 */
function getBallGroup(id) {
  if (id === 0) {
    return "cue";
  }

  if (id === 8) {
    return "eight";
  }

  if (id >= 1 && id <= 7) {
    return "solid";
  }

  if (id >= 9 && id <= 15) {
    return "stripe";
  }

  return null;
}

/**
 * 获取当前玩家组别
 * @returns {'solid' | 'stripe' | null}
 */
function getCurrentPlayerGroup() {
  return state.currentPlayer === 1 ? state.player1Group : state.player2Group;
}

/**
 * 获取对手组别
 * @returns {'solid' | 'stripe' | null}
 */
function getOpponentGroup() {
  return state.currentPlayer === 1 ? state.player2Group : state.player1Group;
}

/**
 * 获取当前玩家编号对应的对手
 * @returns {1 | 2}
 */
function getOpponentPlayer() {
  return state.currentPlayer === 1 ? 2 : 1;
}

/**
 * 统计某组在本帧进袋数量
 * @param {number[]} pocketedIds
 * @param {'solid' | 'stripe'} group
 * @returns {number}
 */
function countPocketedByGroup(pocketedIds, group) {
  return pocketedIds.filter((id) => getBallGroup(id) === group).length;
}

/**
 * 判断某玩家所属组是否已经全部清台
 *
 * 这里根据“已进袋球”无法直接得知全局球桌状态，
 * 因此本阶段使用“规则上约定的剩余球由 game.js 传入更合理”，
 * 但按你当前接口限制，只能在 rules.js 内做简化。
 *
 * 所以这里改为由 processTurn 的 message/流程只依据当前杆是否合法和是否打进 8 号球；
 * 是否“己方已清台”通过参数扩展接口不方便，因此暂时使用 game.js 传入的全局变量会更好。
 *
 * 为了保持你要求的固定接口，这里采用模块级缓存，由 game.js 每杆结束前调用
 * setRemainingCounts(...) 会更合理；但你没有要求导出这个接口。
 *
 * 所以本实现改用 rules.js 内部开放的软依赖：
 * processTurn 第四个可选参数 turnContext，不影响原有 3 参调用。
 */

/**
 * 内部辅助：从可选上下文中拿剩余球数
 * @param {object | undefined} turnContext
 * @returns {{ solid: number, stripe: number }}
 */
function getRemainingCounts(turnContext) {
  if (!turnContext || !turnContext.remainingCounts) {
    return {
      solid: 7,
      stripe: 7
    };
  }

  return turnContext.remainingCounts;
}

/**
 * 是否当前玩家已清台
 * @param {object | undefined} turnContext
 * @returns {boolean}
 */
function hasClearedOwnGroup(turnContext) {
  const currentGroup = getCurrentPlayerGroup();

  if (!currentGroup) {
    return false;
  }

  const remainingCounts = getRemainingCounts(turnContext);
  return remainingCounts[currentGroup] === 0;
}

/**
 * 分配组别
 * 开球后首颗进袋的非 8 号目标球决定当前玩家分组
 *
 * @param {number[]} pocketedIds
 * @returns {'solid' | 'stripe' | null}
 */
function assignGroupsFromPocketed(pocketedIds) {
  for (const id of pocketedIds) {
    const group = getBallGroup(id);

    if (group === "solid" || group === "stripe") {
      if (state.currentPlayer === 1) {
        state.player1Group = group;
        state.player2Group = group === "solid" ? "stripe" : "solid";
      } else {
        state.player2Group = group;
        state.player1Group = group === "solid" ? "stripe" : "solid";
      }

      state.groupAssigned = true;
      return group;
    }
  }

  return null;
}

/**
 * 切换玩家
 */
function switchPlayer() {
  state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
}

/**
 * 推杆规则预留接口（本阶段不实现）
 */
function handlePushOut() {
  // TODO: 国际黑八 push out 规则留空接口
}

/**
 * 每杆结束后处理回合
 *
 * @param {number[]} pocketedIds 本杆进袋球 id
 * @param {boolean} cueBallPocketed 本杆母球是否进袋
 * @param {number | null} firstHitBallId 第一颗被母球击中的球 id
 * @param {object} [turnContext] 可选上下文（game.js 内部可传，不影响原接口使用）
 * @returns {{
 *   foul: boolean,
 *   continuesTurn: boolean,
 *   winner: null | 1 | 2,
 *   message: string
 * }}
 */
export function processTurn(
  pocketedIds,
  cueBallPocketed,
  firstHitBallId,
  turnContext = {}
) {
  if (state.gameMode === "practice") {
    const message = cueBallPocketed
      ? "练习模式：母球进袋，已自动复位。"
      : pocketedIds.length > 0
        ? `练习模式：进袋球 ${pocketedIds.join(", ")}。`
        : "练习模式：本杆结束。";

    state.lastMessage = message;

    return {
      foul: false,
      continuesTurn: false,
      winner: null,
      message
    };
  }

  handlePushOut();

  let foul = false;
  let continuesTurn = false;
  let winner = null;
  const messages = [];

  const currentPlayer = state.currentPlayer;
  const opponentPlayer = getOpponentPlayer();
  const currentGroup = getCurrentPlayerGroup();
  const opponentGroup = getOpponentGroup();

  // 1. 未击中任何球
  if (firstHitBallId == null) {
    foul = true;
    messages.push("犯规：未击中任何球。");
  }

  // 2. 分组后，第一颗击中的球不属于当前玩家组
  if (state.groupAssigned && firstHitBallId != null) {
    const firstHitGroup = getBallGroup(firstHitBallId);

    if (
      currentGroup &&
      firstHitGroup !== currentGroup &&
      firstHitGroup !== "eight"
    ) {
      foul = true;
      messages.push("犯规：第一颗击中的球不属于当前玩家组。");
    }

    // 若击中 8 号球但自己还没清台，也视为违规方向
    if (
      currentGroup &&
      firstHitGroup === "eight" &&
      !hasClearedOwnGroup(turnContext)
    ) {
      foul = true;
      messages.push("犯规：尚未清台时先击中 8 号球。");
    }
  }

  // 3. 母球进袋
  if (cueBallPocketed) {
    foul = true;
    messages.push("犯规：母球进袋。");
  }

  // 4. 分组逻辑：未分组时，首颗进袋的非 8 号球决定组别
  let assignedGroup = null;
  if (!state.groupAssigned) {
    assignedGroup = assignGroupsFromPocketed(pocketedIds);
    if (assignedGroup) {
      messages.push(
        `分组确定：玩家 ${currentPlayer} 为${assignedGroup === "solid" ? "全色" : "花色"}，玩家 ${opponentPlayer} 为${assignedGroup === "solid" ? "花色" : "全色"}。`
      );
    }
  }

  // 5. 8 号球判定
  const pocketedEight = pocketedIds.includes(8);

  if (pocketedEight) {
    const clearedOwnGroup = hasClearedOwnGroup(turnContext);

    if (clearedOwnGroup && !cueBallPocketed && !foul) {
      winner = currentPlayer;
      messages.push(`玩家 ${currentPlayer} 合法打进 8 号球，获胜！`);
    } else {
      winner = opponentPlayer;
      foul = true;
      messages.push(`玩家 ${currentPlayer} 提前或犯规打进 8 号球，玩家 ${opponentPlayer} 获胜！`);
    }
  }

  // 已经分出胜负则不再处理换人/续杆
  if (winner != null) {
    const message = messages.join(" ");
    state.lastMessage = message;

    return {
      foul,
      continuesTurn: false,
      winner,
      message
    };
  }

  // 6. 是否继续回合
  if (!foul) {
    if (!state.groupAssigned) {
      // 未分组阶段：只要打进了非 8 号球即可继续
      const scoredNonEight = pocketedIds.some((id) => {
        const group = getBallGroup(id);
        return group === "solid" || group === "stripe";
      });

      continuesTurn = scoredNonEight;
    } else {
      // 已分组阶段：打进己方球可继续
      continuesTurn =
        currentGroup != null &&
        countPocketedByGroup(pocketedIds, currentGroup) > 0;
    }
  }

  // 7. 换人
  if (foul || !continuesTurn) {
    switchPlayer();
  }

  // 8. 输出提示
  if (messages.length === 0) {
    if (continuesTurn) {
      messages.push(`玩家 ${currentPlayer} 继续击球。`);
    } else {
      messages.push(`轮到玩家 ${state.currentPlayer}。`);
    }
  } else if (!winner) {
    if (foul) {
      messages.push(`轮到玩家 ${state.currentPlayer}。`);
    } else if (continuesTurn) {
      messages.push(`玩家 ${currentPlayer} 继续击球。`);
    } else {
      messages.push(`轮到玩家 ${state.currentPlayer}。`);
    }
  }

  const message = messages.join(" ");
  state.lastMessage = message;

  return {
    foul,
    continuesTurn,
    winner,
    message
  };
}
