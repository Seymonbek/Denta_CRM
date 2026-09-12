import { useQuery } from '@tanstack/react-query'
import {
  getLeaderboardApi,
  getDoctorBadgesApi,
  getRatingStatsApi,
  getAllBadgesApi,
} from '../ratings'

export const LEADERBOARD_QUERY_KEY = ['ratings', 'leaderboard']

export function useLeaderboard(period?: string) {
  return useQuery({
    queryKey: [...LEADERBOARD_QUERY_KEY, period],
    queryFn: () => getLeaderboardApi(period),
  })
}

export function useRatingStats(period?: string) {
  return useQuery({
    queryKey: ['ratings', 'stats', period],
    queryFn: () => getRatingStatsApi(period),
  })
}

export function useAllBadges() {
  return useQuery({
    queryKey: ['ratings', 'badges', 'all'],
    queryFn: getAllBadgesApi,
  })
}

export function useDoctorBadges(doctorId: string) {
  return useQuery({
    queryKey: ['doctors', doctorId, 'badges'],
    queryFn: () => getDoctorBadgesApi(doctorId),
    enabled: Boolean(doctorId),
  })
}

