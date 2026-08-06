import { apiClient } from './client'
import { LeaderboardEntry, DoctorBadge } from '@/types/api'

export async function getLeaderboardApi(): Promise<LeaderboardEntry[]> {
  const response = await apiClient.get<LeaderboardEntry[]>('ratings/leaderboard/')
  return response.data
}

export async function getDoctorBadgesApi(doctorId: string): Promise<DoctorBadge[]> {
  const response = await apiClient.get<DoctorBadge[]>(`doctors/${doctorId}/badges/`)
  return response.data
}
