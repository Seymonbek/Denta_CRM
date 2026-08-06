import { useQuery } from '@tanstack/react-query'
import { getLeaderboardApi, getDoctorBadgesApi } from '../ratings'

export const LEADERBOARD_QUERY_KEY = ['ratings', 'leaderboard']

export function useLeaderboard() {
  return useQuery({
    queryKey: LEADERBOARD_QUERY_KEY,
    queryFn: getLeaderboardApi,
  })
}

export function useDoctorBadges(doctorId: string) {
  return useQuery({
    queryKey: ['doctors', doctorId, 'badges'],
    queryFn: () => getDoctorBadgesApi(doctorId),
    enabled: Boolean(doctorId),
  })
}
