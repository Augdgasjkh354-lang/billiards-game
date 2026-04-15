/**
 * 规则层
 * 支持：
 * - 8ball：中式黑八（本阶段按简化规则）
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
      : "中式黑八：玩家 1 开球。";
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
 * 判断球属于哪一组
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
 * 获取对手玩家编号
 * @returns {1 | 2}
 */
function getOpponentPlayer() {
  return state.currentPlayer === 1 ? 2 : 1;
}

/**
 * 统计某组本杆进袋数量
 * @param {number[]} pocketedIds
 * @param {'solid' | 'stripe'} group
 * @returns {number}
 */
function countPocketedByGroup(pocketedIds, group) {
  return pocketedIds.filter((id) => getBallGroup(id) === group).length;
}

/**
 * 获取剩余球数量
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
 * 当前玩家是否已清台
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
 * 通过首颗有效进袋球分组
 * @param {number[]} pocketedIds
 * @returns {'solid' | 'stripe' | null}
 */
function assignGroupsFromPocketed(pocketedIds) {
  for (const id of pocketedIds) {
    const group = getBallGroup(id);

    if (group !== "solid" && group !== "stripe") {
      continue;
    }

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

  return null;
}

/**
 * 切换玩家
 */
function switchPlayer() {
  state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
}

/**
 * 国际黑八 push out 规则预留接口
 */
function handlePushOut() {
  // TODO: 国际黑八 push out 规则留空
}

/**
 * 每杆结束后处理回合
 *
 * @param {number[]} pocketedIds 本杆进袋球 id
 * @param {boolean} cueBallPocketed 本杆母球是否进袋
 * @param {number | null} firstHitBallId 第一颗被母球击中的球 id
 * @param {object} [turnContext]
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
    const targetPocketedCount = pocketedIds.filter((id) => id !== 0).length;

    let message = "练习模式：本杆结束。";

    if (cueBallPocketed) {
      message = "练习模式：母球进袋，已自动复位。";
    } else if (targetPocketedCount > 0) {
      message = `练习模式：本杆进袋 ${targetPocketedCount} 颗。`;
    }

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

  // 1. 未击中任何球
  if (firstHitBallId == null) {
    foul = true;
    messages.push("犯规：未击中任何球。");
  }

  // 2. 分组后第一颗击中的球不属于当前玩家
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

  // 4. 未分组时，首颗非 8 号进袋球决定分组
  if (!state.groupAssigned) {
    const assignedGroup = assignGroupsFromPocketed(pocketedIds);

    if (assignedGroup) {
      const selfText = assignedGroup === "solid" ? "全色" : "花色";
      const oppText = assignedGroup === "solid" ? "花色" : "全色";
      messages.push(
        `分组确定：玩家 ${currentPlayer} 为${selfText}，玩家 ${opponentPlayer} 为${oppText}。`
      );
    }
  }

  // 5. 8 号球判定
  if (pocketedIds.includes(8)) {
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

  // 已有胜负
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
      continuesTurn = pocketedIds.some((id) => {
        const group = getBallGroup(id);
        return group === "solid" || group === "stripe";
      });
    } else {
      continuesTurn =
        currentGroup != null &&
        countPocketedByGroup(pocketedIds, currentGroup) > 0;
    }
  }

  // 7. 换人
  if (foul || !continuesTurn) {
    switchPlayer();
  }

  // 8. 生成提示
  if (messages.length === 0) {
    if (continuesTurn) {
      messages.push(`玩家 ${currentPlayer} 继续击球。`);
    } else {
      messages.push(`轮到玩家 ${state.currentPlayer}。`);
    }
  } else {
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
