import { GameType, Difficulty } from '@puzzle-roll/shared';

const GAME_EMOJI: Record<GameType, string> = {
  [GameType.SUDOKU]: '🔢',
  [GameType.QUEENS]: '👑',
  [GameType.ZIP]: '🔗',
  [GameType.TANGO]: '☯️',
  [GameType.NONOGRAM]: '🖼️',
  [GameType.MINESWEEPER]: '💣',
  [GameType.KAKURO]: '➕',
  [GameType.LIGHT_UP]: '💡',
  [GameType.FUTOSHIKI]: '⚖️',
  [GameType.HITORI]: '⬛',
};

const DIFFICULTY_STARS: Record<Difficulty, string> = {
  [Difficulty.EASY]: '⭐',
  [Difficulty.MEDIUM]: '⭐⭐',
  [Difficulty.HARD]: '⭐⭐⭐',
  [Difficulty.EXPERT]: '⭐⭐⭐⭐',
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function buildPerformanceBar(elapsedSeconds: number, hintsUsed: number): string {
  // 5 blocks: green = completed without hints, yellow = hints used, red = many hints
  const blocks = 5;
  const hintPenalty = Math.min(hintsUsed, blocks);
  const green = blocks - hintPenalty;
  return '🟩'.repeat(green) + '🟨'.repeat(hintPenalty);
}

export function generateShareableResult(params: {
  gameType: GameType;
  difficulty: Difficulty;
  elapsedSeconds: number;
  hintsUsed: number;
  date: string;
  isDaily: boolean;
}): string {
  const { gameType, difficulty, elapsedSeconds, hintsUsed, date, isDaily } = params;

  const gameEmoji = GAME_EMOJI[gameType];
  const stars = DIFFICULTY_STARS[difficulty];
  const time = formatTime(elapsedSeconds);
  const bar = buildPerformanceBar(elapsedSeconds, hintsUsed);
  const hintText = hintsUsed === 0 ? 'No hints' : `${hintsUsed} hint${hintsUsed > 1 ? 's' : ''}`;
  const prefix = isDaily ? `Daily ${date}` : difficulty;

  return [
    `${gameEmoji} Puzzle Roll — ${gameType.charAt(0).toUpperCase() + gameType.slice(1)}`,
    `${prefix} ${stars}`,
    bar,
    `⏱️ ${time} | ${hintText}`,
    `puzzleroll.com`,
  ].join('\n');
}
