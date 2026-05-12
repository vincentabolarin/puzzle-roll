import { GameType, Difficulty } from '@puzzle-roll/shared';
import { Platform } from 'react-native';

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

const DIFFICULTY_DISPLAY: Record<Difficulty, string> = {
  [Difficulty.EASY]:   '🟢 Easy',
  [Difficulty.MEDIUM]: '🟡 Medium',
  [Difficulty.HARD]:   '🟠 Hard',
  [Difficulty.EXPERT]: '🔴 Expert',
};

// Update these with your real store URLs before launch
const STORE_URL = Platform.OS === 'ios'
  ? 'https://apps.apple.com/app/puzzle-roll/id0000000000'
  : 'https://play.google.com/store/apps/details?id=com.puzzleroll.puzzleroll';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function buildPerformanceBar(hintsUsed: number): string {
  const blocks = 5;
  const hintPenalty = Math.min(hintsUsed, blocks);
  return '🟩'.repeat(blocks - hintPenalty) + '🟨'.repeat(hintPenalty);
}

export function generateShareableResult(params: {
  gameType: GameType;
  difficulty: Difficulty;
  elapsedSeconds: number;
  hintsUsed: number;
  date: string;
  isDaily: boolean;
  streak?: number;
  serialNumber?: number;
}): string {
  const { gameType, difficulty, elapsedSeconds, hintsUsed, date, isDaily, streak, serialNumber } = params;

  const gameEmoji = GAME_EMOJI[gameType];
  const gameName = gameType.charAt(0).toUpperCase() + gameType.slice(1).replace(/_/g, ' ');
  const diffDisplay = DIFFICULTY_DISPLAY[difficulty];
  const time = formatTime(elapsedSeconds);
  const bar = buildPerformanceBar(hintsUsed);
  const hintText = hintsUsed === 0 ? 'No hints' : `${hintsUsed} hint${hintsUsed > 1 ? 's' : ''}`;
  const prefix = isDaily
    ? (serialNumber ? `Daily #${serialNumber} · ${date}` : `Daily ${date}`)
    : diffDisplay;

  const lines = [
    `${gameEmoji} Puzzle Roll — ${gameName}`,
    prefix,
    bar,
    `⏱️ ${time} | ${hintText}`,
  ];

  // streak >= 1: even a 1-day streak is worth showing ("🔥 1-day streak" = first day!)
  if (isDaily && streak != null && streak >= 1) {
    lines.push(`🔥 ${streak}-day streak`);
  }

  lines.push(STORE_URL);

  return lines.join('\n');
}