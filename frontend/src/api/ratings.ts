import { apiClient } from './client'
import { type LeaderboardEntry, type DoctorBadge, type Badge, type RatingStats } from '@/types/api'

export async function getLeaderboardApi(period?: string): Promise<LeaderboardEntry[]> {
  const response = await apiClient.get<LeaderboardEntry[]>('ratings/leaderboard/', {
    params: { period: period || undefined },
  })
  return response.data
}

export async function getRatingStatsApi(period?: string): Promise<RatingStats> {
  const response = await apiClient.get<RatingStats>('ratings/stats/', {
    params: { period: period || undefined },
  })
  return response.data
}

export async function getAllBadgesApi(): Promise<Badge[]> {
  const response = await apiClient.get<Badge[]>('ratings/badges/')
  return response.data
}

export async function getDoctorBadgesApi(doctorId: string): Promise<DoctorBadge[]> {
  const response = await apiClient.get<DoctorBadge[]>(`doctors/${doctorId}/badges/`)
  return response.data
}

