import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,       // 5 minutes
      gcTime: 1000 * 60 * 30,          // 30 minutes
      retry: (failureCount, error) => {
        // Don't retry 401/403/404
        if (
          error instanceof Error &&
          'statusCode' in error &&
          [401, 403, 404].includes((error as { statusCode: number }).statusCode)
        ) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

export const queryKeys = {
  puzzles: {
    all: ['puzzles'] as const,
    byGame: (gameType: string) => ['puzzles', gameType] as const,
    daily: (gameType: string) => ['puzzles', gameType, 'daily'] as const,
    byId: (id: string) => ['puzzles', 'id', id] as const,
    list: (gameType: string, difficulty?: string, page?: number) =>
      ['puzzles', gameType, 'list', { difficulty, page }] as const,
  },
  leaderboard: {
    daily: (gameType: string) => ['leaderboard', gameType, 'daily'] as const,
    allTime: (gameType: string) => ['leaderboard', gameType, 'alltime'] as const,
  },
  user: {
    me: ['user', 'me'] as const,
    stats: ['user', 'stats'] as const,
    progress: (userId: string) => ['user', 'progress', userId] as const,
  },
} as const;
