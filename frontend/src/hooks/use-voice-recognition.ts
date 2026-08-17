import { useState, useEffect, useCallback, useRef } from 'react'

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function useVoiceRecognition(onResult?: (text: string) => void) {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'uz-UZ' // O'zbek tili uchun, kerak bo'lsa 'ru-RU' yoki 'en-US' qo'shish mumkin

      recognition.onstart = () => {
        setIsRecording(true)
        setError(null)
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onerror = (event: any) => {
        setIsRecording(false)
        if (event.error === 'not-allowed') {
          setError('Mikrofonga ruxsat berilmadi.')
        } else {
          setError(`Xatolik: ${event.error}`)
        }
      }

      recognition.onend = () => {
        setIsRecording(false)
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let finalTranscript = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript
          }
        }
        
        if (finalTranscript) {
          setTranscript((prev) => {
            const newText = prev ? `${prev} ${finalTranscript}` : finalTranscript
            if (onResult) {
              onResult(newText)
            }
            return newText
          })
        }
      }

      recognitionRef.current = recognition
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError('Brauzeringiz ovozli yozishni qo\'llab-quvvatlamaydi. Iltimos Google Chrome dan foydalaning.')
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [onResult])

  const startRecording = useCallback(() => {
    setTranscript('')
    setError(null)
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start()
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Speech recognition start error', err)
      }
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
  }, [])

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  return {
    isRecording,
    transcript,
    error,
    startRecording,
    stopRecording,
    toggleRecording,
    setTranscript
  }
}
