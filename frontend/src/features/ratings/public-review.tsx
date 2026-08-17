import { useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { _Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useCreateReview } from '@/api/hooks/use-reviews'
import { toast } from 'sonner'
import { useDoctors } from '@/api/hooks/use-doctors'

export function PublicReviewPage() {
  const search = useSearch({ strict: false })
  // We expect ?doctor_id=xxx
  const doctorId = (search as Record<string, string>).doctor_id

  const { data: doctorsData } = useDoctors()
  const doctors = Array.isArray(doctorsData?.results) ? doctorsData.results : []
  const doctor = doctors.find((d: Record<string, unknown>) => d.id === doctorId)

  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const createReview = useCreateReview()

  const handleSubmit = async () => {
    if (!doctorId) {
      toast.error('Shifokor tanlanmagan')
      return
    }
    if (rating === 0) {
      toast.error('Iltimos, baho (yulduzcha) tanlang')
      return
    }
    try {
      await createReview.mutateAsync({
        doctorId,
        rating,
        comment,
      })
      setSubmitted(true)
    } catch (_error) {
      toast.error('Xatolik yuz berdi. Iltimos qayta urinib ko\'ring.')
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🎉</span>
          </div>
          <h2 className="text-2xl font-semibold mb-2">Katta rahmat!</h2>
          <p className="text-slate-500 mb-6">
            Sizning fikringiz biz uchun juda muhim. Shifokorimiz xizmatidan mamnun bo'lganingizdan xursandmiz.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border p-6">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Shifokorni Baholang</h1>
          <p className="text-slate-500">
            {doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : 'Shifokor'} qabulida bo'ldingiz. Xizmat qanday bo'ldi?
          </p>
        </div>

        <div className="flex justify-center gap-2 mb-8">
          {[1, 2, 3, 4, 5].map((star) => {
            const isFilled = (hoverRating || rating) >= star
            return (
              <button
                key={star}
                type="button"
                className={`p-2 transition-colors duration-200 ${
                  isFilled ? 'text-yellow-400' : 'text-slate-200 hover:text-yellow-200'
                }`}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill={isFilled ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-10 h-10"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
            )
          })}
        </div>

        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Izohingiz (ixtiyoriy)
            </label>
            <Textarea
              placeholder="Shifokor ishi haqida fikringizni yozing..."
              className="resize-none h-24"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        </div>

        <Button
          className="w-full h-12 text-lg"
          onClick={handleSubmit}
          disabled={createReview.isPending || rating === 0}
        >
          {createReview.isPending ? 'Yuborilmoqda...' : 'Fikrni yuborish'}
        </Button>
      </div>
    </div>
  )
}
