import { useQuery } from '@tanstack/react-query'
import { getToothRecordsApi } from '../odontogram'

export function useToothRecords(params?: { treatment?: string; toothNumber?: number; page?: number }) {
  return useQuery({
    queryKey: ['tooth-records', params],
    queryFn: () => getToothRecordsApi(params),
  })
}
