import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/api/client'

export interface PatientReview {
  id: string
  doctorId: string
  patientId: string | null
  treatmentId: string | null
  rating: number
  comment: string
  patientName?: string
  createdAt: string
}

export function useDoctorReviews(doctorId: string) {
  return useQuery({
    queryKey: ['reviews', doctorId],
    queryFn: async () => {
      const res = await api.get<{ results: PatientReview[] }>(`/ratings/reviews/`, {
        params: { doctor_id: doctorId }
      })
      return res.data.results
    },
    enabled: Boolean(doctorId),
  })
}

export function useCreateReview() {
  return useMutation({
    mutationFn: async (data: { doctorId: string, rating: number, comment: string }) => {
      const payload = {
        doctor_id: data.doctorId,
        rating: data.rating,
        comment: data.comment,
      }
      const res = await api.post(`/ratings/reviews/`, payload)
      return res.data
    },
  })
}
