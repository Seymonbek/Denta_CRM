import { useState, useRef, useEffect } from 'react'
import {
  Bot,
  Send,
  User,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Package,
  Shield,
  Lightbulb,
  AlertTriangle,
  Mic,
  MicOff,
  Stethoscope,
  Pill,
  CheckCircle2,
} from 'lucide-react'
import { format } from 'date-fns'
import {
  useAIChat,
  useAIInventorySummary,
  useAIPermissions,
  useUpdateAIPermission,
} from '@/api/hooks/use-ai'
import { useVoiceRecognition } from '@/hooks/use-voice-recognition'
import { useMe } from '@/api/hooks/use-auth'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

interface ChatMessage {
  id: string
  sender: 'user' | 'ai'
  text: string
  timestamp: string
  source?: string
}

const QUICK_SUGGESTIONS = [
  '📊 Bugungi kassa tushumi va navbatlar statistikasi qanday?',
  '📦 Qaysi materiallar kam qoldi va shoshilinch sotib olish kerak?',
  '👨‍⚕️ Klinika shifokorlari faoliyati va komissiyalari haqida ma\'lumot ber',
  '💡 Bemorlarga xizmat ko\'rsatish sifatini oshirish bo\'yicha tavsiyalar ber',
]

const CLINICAL_DIAGNOSES = [
  {
    id: 'pulpitis',
    title: "O'tkir va Surunkali Pulpit",
    icd10: 'K04.0 (Pulpit)',
    urgency: 'Shoshilinch',
    steps: [
      "1. Infiltratsion yoki o'tkazuvchan anesteziya (Artikain 1:100 000 / 1:200 000)",
      "2. Karioz to'qimalarni to'liq tozalash va tish bo'shlig'ini ochish",
      "3. Pulpa ekstirpatsiyasi va ildiz kanallaridan nervni evakuatsiya qilish",
      "4. Apekslokator orqali har bir kanalning ishchi uzunligini aniqlash va rentgen tasdiqlash",
      "5. Mexanik kengaytirish (ProTaper / WaveOne) va medikamentoz ishlov (NaOCl 3% + EDTA 17%)",
      "6. Kanallarni gutapercha va AH Plus / Adseal sileri bilan zich obturatsiya qilish",
      "7. Fotopolimer kompozit restavratsiya yoki keramik onlay/tojka",
    ],
    prescription: "Nimesil 100mg - og'riq bo'lsa 1 paket ovqatdan keyin (3 kun); Iliq sodali suvda chayish",
    materials: "Artikain, K-fayllar, NaOCl 3%, EDTA 17%, Gutapercha, AH Plus, Fotokompozit",
    patientCare: "2 kun davomida davolangan tish bilan qattiq ovqat chaynamaslik, issiq-sovuqdan asrash",
  },
  {
    id: 'caries',
    title: 'O\'rta va Chuqur Karies',
    icd10: 'K02.1 (Dentin kariesi)',
    urgency: 'Rejali',
    steps: [
      "1. Mahalliy infiltratsion anesteziya",
      "2. Karies marker nazoratida zararlangan to'qimalarni ekskavatsiya qilish",
      "3. Bo'shliqni 2% xlorgeksidin bilan antiseptik tozalash",
      "4. Selektiv kislota bilan gravirovka (37% fosfor kislotasi 15 sek)",
      "5. 5/7-avlod adgeziv tizimini (Bond) surtish va 20 sek polimerizatsiya",
      "6. Fotokompozit (Gradia / Filtek) bilan qatlamma-qatlam anatomik tiklash",
      "7. Okluzion korreksiya va olmosli jilolovchi disklar bilan pardozlash",
    ],
    prescription: "R.O.C.S. Medical Minerals geli - kuniga 2 mahal 10 kun surtish",
    materials: "Bordona, Kislota 37%, Bond, Matritsa tizimi, Kompozit plomba, Polirovka disklari",
    patientCare: "2 soat rangli ichimliklar (qahva, choy) ichmaslik tavsiya etiladi",
  },
  {
    id: 'periodontitis',
    title: 'Periapikal Periodontit',
    icd10: 'K04.5 (Surunkali apikal periodontit)',
    urgency: 'Yuqori',
    steps: [
      "1. Anesteziya va ildiz kanallarini to'liq reviziya qilish",
      "2. Nekrotik massalarni yuvish va patologik mikroflorani zararsizlantirish",
      "3. Ultrasonik faollashtirilgan gipoxlorit 3-5% bilan uzoq chayish",
      "4. Kanallarga kaltsiy gidroksid pastasini (Metapex / Calcicur) 10-14 kunga kiritish",
      "5. Vaqtinchalik zich germetik plomba qo'yish",
      "6. Ikkinchi tashrifda: Rentgen nazorati va doimiy obturatsiya",
    ],
    prescription: "Amoxiclav 625mg (har 8 soatda 5 kun); Nimesil 1 paket 2 mahal (3 kun)",
    materials: "NaOCl 3%, Metapex kaltsiy gidroksid, Vaqtinchalik tsement, Gutapercha",
    patientCare: "Muolajadan so'ng biroz simillash tabiiy, shish paydo bo'lsa darhol klinikaga murojaat qiling",
  },
  {
    id: 'extraction',
    title: 'Tish Ekstraktsiyasi (Jarrohlik olib tashlash)',
    icd10: 'K01.1 (Retensiyalangan / destruktiv tish)',
    urgency: 'Shoshilinch / Rejali',
    steps: [
      "1. Chuqur o'tkazuvchan yoki infiltratsion anesteziya",
      "2. Dumaloq bog'lamni sindesmotomiya qilish",
      "3. Elevator va jarrohlik qisqichi bilan atraumatik dislokatsiya",
      "4. Katakchani kuretaj qilish va yallig'lanish to'qimasini tozalash",
      "5. Gemosfongia / kollagen konusi qo'yish va qon laxtasini shakllantirish",
      "6. Zaruratda chok qo'yish (Vicryl / Prolene 4-0)",
    ],
    prescription: "Augmentin 625mg 2 mahal 5 kun; Ketonal 50mg; Xlorgeksidin vanna (2-kundan)",
    materials: "Jarrohlik qisqichlari, Elevator, Kuretaj qoshig'i, Gemosfong, Chok iplari",
    patientCare: "20 daqiqadan so'ng tamponni tashlash. 2 soat ovqatlanmaslik, issiq dush va qattiq chayish taqiqlanadi!",
  },
  {
    id: 'implant',
    title: 'Dental Implantatsiya Operatsiyasi',
    icd10: 'Z96.5 (Tish implantatsiyasi rejimi)',
    urgency: 'Rejali jarrohlik',
    steps: [
      "1. Kompyuter tomografiyasi (CBCT) asosida 3D suyak modelini tahlil qilish",
      "2. Mahalliy og'riqsizlantirish va shilliq-periostal tilim ajratish",
      "3. Pilot va ketma-ket kengaytiruvchi frezalar bilan osteotomiya",
      "4. Implantni 35 Ncm tork bilan o'rnatish va birlamchi barqarorlikni tekshirish",
      "5. Yopuvchi vint (zaglushka) yoki shakllantiruvchi (formirovatel) o'rnatish",
      "6. Shilliq qavatni monofilament chok bilan germetik tikish",
    ],
    prescription: "Augmentin 875/125mg 2 mahal 7 kun; Loratadin 10mg (3 kun); Muzli kompress",
    materials: "Implant tizimi (Osstem / Straumann), Fiziodispenser, Frezalar to'plami, Chok ipi",
    patientCare: "Dastlabki 24 soatda yanoqqa 15 daqiqalik muzli kompress; 7 kun qattiq chaynamaslik",
  },
  {
    id: 'periodont',
    title: 'Gingivit va Parodontit (Professional tozalash)',
    icd10: 'K05.0 (O\'tkir gingivit) / K05.3 (Surunkali periodontit)',
    urgency: 'Profilaktika / Davolash',
    steps: [
      "1. Antiseptik og'iz chayish (0.05% xlorgeksidin)",
      "2. Ultratovushli skeyler bilan subgingival va supragingival toshlarni olib tashlash",
      "3. Air-Flow nozik kaltsiy karbonat kukuni bilan pigmentlarni tozalash",
      "4. Abrasiv pasta va rezina qalpoqchalar bilan emalni jilolash",
      "5. Milklarga Metrogil Denta va Asepta fito-balzami applikatsiyasi",
      "6. Ftorli lak bilan emalni boyitish",
    ],
    prescription: "Metrogil Denta geli 2 mahal 7 kun; Xlorgeksidin 0.05% chayish",
    materials: "Ultratovush nasadkalari, Air-Flow kukuni, Jilolovchi pasta, Metrogil Denta",
    patientCare: "Har 6 oyda profilaktik tozalash; yumshoq cho'tka va tish ipidan to'g'ri foydalanish",
  },
]

export function AIAssistantPage() {
  const { data: user } = useMe()
  const chatMutation = useAIChat()
  const { data: inventorySummary, isLoading: isInventoryLoading } = useAIInventorySummary()
  const { data: permissionsData = [] } = useAIPermissions()
  const updatePermissionMutation = useUpdateAIPermission()

  const permissionsList = Array.isArray(permissionsData) ? permissionsData : []

  const [activeTab, setActiveTab] = useState('chat')
  const [selectedTooth, setSelectedTooth] = useState('16')
  const [selectedCondition, setSelectedCondition] = useState('pulpitis')
  const [symptomsInput, setSymptomsInput] = useState('')
  const [clinicalResult, setClinicalResult] = useState<any>(CLINICAL_DIAGNOSES[0])
  const [isClinicalAnalyzing, setIsClinicalAnalyzing] = useState(false)

  const [inputMessage, setInputMessage] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleRunClinicalAnalysis = () => {
    setIsClinicalAnalyzing(true)
    setTimeout(() => {
      const found = CLINICAL_DIAGNOSES.find((d) => d.id === selectedCondition) || CLINICAL_DIAGNOSES[0]
      setClinicalResult({
        ...found,
        toothNumber: selectedTooth,
        patientSymptoms: symptomsInput,
      })
      setIsClinicalAnalyzing(false)
      toast.success("AI Klinik tavsiya va reja shakllantirildi! 🩺✨")
    }, 350)
  }

  const handleAskAIChatAboutCase = () => {
    const text = `Tish #${selectedTooth} bo'yicha ${clinicalResult?.title || 'davolash'} tashxisi tahlili: Bemor shikoyati: ${symptomsInput || 'Standart belgilar'}. Ushbu holatda asoratlarni oldini olish va davolash protokoli bo'yicha tavsiya bering.`
    setActiveTab('chat')
    handleSendMessage(text)
  }
  
  const { isRecording, toggleRecording, error: voiceError } = useVoiceRecognition((text) => {
    setInputMessage(text)
  })

  // Show voice error if any
  useEffect(() => {
    if (voiceError) {
      toast.error(voiceError)
    }
  }, [voiceError])
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'ai',
      text: `Assalomu alaykum, ${user?.firstName || 'Foydalanuvchi'}! Men DentaCRM aqlli Sun'iy Intelekt (AI) yordamchisiman. 🤖✨\n\nKlinikangizdagi bemorlar, kassa tushumi, shifokorlar jadvali va sklad zaxiralari bo'yicha har qanday savolingizga real-vaqt rejimida javob bera olaman. Sizga qanday yordam bera olaman?`,
      timestamp: new Date().toISOString(),
      source: 'gemini-ai',
    },
  ])

  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputMessage).trim()
    if (!textToSend || chatMutation.isPending) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMsg])
    if (!customText) setInputMessage('')

    try {
      const response = await chatMutation.mutateAsync(textToSend)
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: response.message || (response as any).answer || 'Javob shakllantirilmadi.',
        timestamp: response.timestamp || new Date().toISOString(),
        source: response.source || 'gemini-ai',
      }
      setMessages((prev) => [...prev, aiMsg])
    } catch {
      toast.error('AI serveriga ulanishda xatolik yuz berdi.')
      const errorMsg: ChatMessage = {
        id: `ai-err-${Date.now()}`,
        sender: 'ai',
        text: 'Kechirasiz, serverda tarmoq xatoligi yuz berdi. Iltimos qaytadan urinib ko\'ring.',
        timestamp: new Date().toISOString(),
        source: 'crm-smart-assistant',
      }
      setMessages((prev) => [...prev, errorMsg])
    }
  }

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    toast.success('Matn nusxalandi!')
    setTimeout(() => setCopiedId(null), 2000)
  }

  const isBoshShifokor = (user?.role as any) === 'bosh_shifokor' || (user?.role as any) === 'admin'

  const totalItemsCount = (inventorySummary as any)?.totalItemsCount ?? (inventorySummary as any)?.total_items_count ?? 0
  const lowStockItemsCount = (inventorySummary as any)?.lowStockItemsCount ?? (inventorySummary as any)?.low_stock_items_count ?? 0
  const aiRecommendation = (inventorySummary as any)?.aiRecommendation || (inventorySummary as any)?.ai_recommendation || "Barcha zaxira materiallari yetarli darajada. Sklad holati a'lo!"

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <Sparkles className='h-5 w-5 text-primary animate-pulse' />
          <span>DentaCRM AI Smart Assistant</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        <div className='mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight flex items-center gap-2'>
              Sun'iy Intelekt Yordamchisi (Gemini AI)
            </h1>
            <p className='text-xs text-muted-foreground'>
              Real-vaqt rejimida klinika analitikasi, kassa hisobi va zaxira monitoringi bo'yicha savol-javob.
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className='space-y-4'>
          <TabsList className='bg-muted/50 p-1'>
            <TabsTrigger value='chat' className='flex items-center gap-1.5 text-xs font-medium'>
              <Bot className='h-4 w-4' /> AI Chatbot
            </TabsTrigger>
            <TabsTrigger value='clinical' className='flex items-center gap-1.5 text-xs font-medium'>
              <Stethoscope className='h-4 w-4' /> AI Klinik Reja
            </TabsTrigger>
            <TabsTrigger value='inventory' className='flex items-center gap-1.5 text-xs font-medium'>
              <Package className='h-4 w-4' /> AI Sklad Tahlili
            </TabsTrigger>
            {isBoshShifokor && (
              <TabsTrigger value='permissions' className='flex items-center gap-1.5 text-xs font-medium'>
                <Shield className='h-4 w-4' /> AI Ruxsatlar
              </TabsTrigger>
            )}
          </TabsList>

          {/* AI Chat Tab */}
          <TabsContent value='chat'>
            <div className='grid grid-cols-1 lg:grid-cols-4 gap-4'>
              {/* Chat Main Window */}
              <Card className='lg:col-span-3 flex flex-col h-[650px] shadow-sm border-primary/20'>
                <CardHeader className='py-3 border-b bg-muted/20 flex flex-row items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <div className='flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary'>
                      <Bot className='h-4 w-4' />
                    </div>
                    <div>
                      <CardTitle className='text-sm font-bold'>DentaCRM AI Expert</CardTitle>
                      <p className='text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1'>
                        <span className='h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping' /> Online · Gemini 2.5 Flash API
                      </p>
                    </div>
                  </div>
                  <Button
                    size='sm'
                    variant='ghost'
                    className='h-8 text-xs'
                    onClick={() =>
                      setMessages([
                        {
                          id: `welcome-${Date.now()}`,
                          sender: 'ai',
                          text: `Suhbat tozalandi. Sizga yana qanday yordam bera olaman, ${user?.firstName || ''}?`,
                          timestamp: new Date().toISOString(),
                          source: 'gemini-ai',
                        },
                      ])
                    }
                  >
                    <RefreshCw className='h-3.5 w-3.5 me-1' /> Tozalash
                  </Button>
                </CardHeader>

                {/* Message Log */}
                <CardContent className='flex-1 overflow-y-auto p-4 space-y-4'>
                  {messages.map((msg) => {
                    const isUser = msg.sender === 'user'
                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                      >
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            isUser
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          }`}
                        >
                          {isUser ? <User className='h-4 w-4' /> : <Bot className='h-4 w-4' />}
                        </div>

                        <div className={`space-y-1 max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
                          <div
                            className={`p-3.5 rounded-2xl text-xs whitespace-pre-line leading-relaxed shadow-sm ${
                              isUser
                                ? 'bg-primary text-primary-foreground rounded-tr-none'
                                : 'bg-card border rounded-tl-none font-sans text-foreground'
                            }`}
                          >
                            {msg.text}
                          </div>

                          <div className='flex items-center gap-2 px-1 text-[10px] text-muted-foreground'>
                            <span>
                              {formatDateSafely(msg.timestamp)}
                            </span>
                            {!isUser && (
                              <>
                                <span>•</span>
                                <Badge variant='outline' className='text-[9px] py-0 h-4 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'>
                                  {msg.source === 'gemini-ai' ? 'Gemini 2.5 AI' : 'Smart Assistant'}
                                </Badge>
                                <button
                                  onClick={() => handleCopy(msg.id, msg.text)}
                                  className='hover:text-foreground ms-1 transition-colors'
                                  title='Nusxalash'
                                >
                                  {copiedId === msg.id ? <Check className='h-3 w-3 text-emerald-500' /> : <Copy className='h-3 w-3' />}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {chatMutation.isPending && (
                    <div className='flex gap-3 flex-row items-center'>
                      <div className='flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 animate-spin'>
                        <RefreshCw className='h-4 w-4' />
                      </div>
                      <div className='bg-card border p-3 rounded-2xl rounded-tl-none text-xs text-muted-foreground animate-pulse'>
                        AI o'ylamoqda va klinika ma'lumotlarini tahlil qilmoqda... 🧠✨
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </CardContent>

                {/* Input Bar */}
                <div className='p-3 border-t bg-card space-y-2'>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleSendMessage()
                    }}
                    className='flex gap-2'
                  >
                    <Input
                      placeholder={isRecording ? "Sizni eshitmoqdaman..." : "Savolingizni kiriting (Masalan: Bugun nechta bemor keldi?)..."}
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      className={`text-xs flex-1 h-10 ${isRecording ? 'border-rose-500 bg-rose-500/5 placeholder:text-rose-500' : ''}`}
                      disabled={chatMutation.isPending}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className={`h-10 w-10 p-0 shrink-0 transition-colors ${
                        isRecording 
                          ? 'border-rose-500 text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 hover:text-rose-600 animate-pulse' 
                          : 'text-muted-foreground'
                      }`}
                      onClick={toggleRecording}
                      disabled={chatMutation.isPending}
                      title={isRecording ? "Yozishni to'xtatish" : "Ovozli kiritish"}
                    >
                      {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </Button>
                    <Button type='submit' className='h-10 px-4' disabled={chatMutation.isPending || !inputMessage.trim()}>
                      <Send className='h-4 w-4 me-1' /> Yuborish
                    </Button>
                  </form>
                </div>
              </Card>

              {/* Quick Prompts & Stats Side Panel */}
              <div className='space-y-4'>
                <Card className='shadow-sm'>
                  <CardHeader className='py-3 border-b'>
                    <CardTitle className='text-xs font-bold flex items-center gap-1.5 text-primary'>
                      <Lightbulb className='h-4 w-4' /> Tezkor Tayyor Savollar
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='p-3 space-y-2'>
                    {QUICK_SUGGESTIONS.map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(prompt)}
                        className='w-full text-start text-xs p-2.5 rounded-xl border bg-muted/20 hover:bg-primary/10 hover:border-primary/40 transition-all text-muted-foreground hover:text-foreground font-medium'
                      >
                        {prompt}
                      </button>
                    ))}
                  </CardContent>
                </Card>

                <Card className='shadow-sm bg-gradient-to-br from-primary/5 via-card to-emerald-500/5 border-primary/20'>
                  <CardHeader className='py-3 border-b'>
                    <CardTitle className='text-xs font-bold'>⚡ AI Imkoniyatlari</CardTitle>
                  </CardHeader>
                  <CardContent className='p-3 text-xs space-y-2 text-muted-foreground'>
                    <p>✓ <strong>Real-vaqt Kassa:</strong> Kunlik tushum va qarzdorliklar</p>
                    <p>✓ <strong>Sklad Progonoz:</strong> Kam qolgan plomba va sarf materiallari</p>
                    <p>✓ <strong>Shifokorlar KPI:</strong> Bajarilgan muolajalar va reyting</p>
                    <p>✓ <strong>Shablon Yaratish:</strong> Bemorlar uchun tavsiyanoma va retseptlar</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* AI Clinical Diagnosis & Treatment Plan Tab */}
          <TabsContent value='clinical'>
            <div className='grid grid-cols-1 lg:grid-cols-3 gap-5'>
              {/* Left Column: Case Parameters */}
              <Card className='shadow-sm border-primary/20 flex flex-col justify-between'>
                <div>
                  <CardHeader className='pb-3 border-b bg-muted/20'>
                    <div className='flex items-center justify-between'>
                      <CardTitle className='text-sm font-bold flex items-center gap-2'>
                        <Stethoscope className='h-4 w-4 text-primary' /> Klinik Holat Parametrlari
                      </CardTitle>
                      <Badge variant='outline' className='text-[10px] bg-primary/5 text-primary border-primary/20'>
                        Stomatologik AI
                      </Badge>
                    </div>
                    <CardDescription className='text-xs'>
                      Tish raqami, kasallik va bemor shikoyatlarini tanlang.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='p-4 space-y-4 text-xs'>
                    <div className='space-y-1.5'>
                      <label className='font-semibold text-muted-foreground'>Zararlangan Tish Raqami (FDI)</label>
                      <Select value={selectedTooth} onValueChange={setSelectedTooth}>
                        <SelectTrigger className='h-9 text-xs'>
                          <SelectValue placeholder='Tishni tanlang' />
                        </SelectTrigger>
                        <SelectContent className='max-h-56'>
                          <SelectItem value='all'>Barcha tishlar (Umumiy)</SelectItem>
                          <SelectItem value='11'>11 (Yuqori o'ng markaziy kurak)</SelectItem>
                          <SelectItem value='12'>12 (Yuqori o'ng yon kurak)</SelectItem>
                          <SelectItem value='13'>13 (Yuqori o'ng qoziq tish)</SelectItem>
                          <SelectItem value='14'>14 (Yuqori o'ng 1-premolyar)</SelectItem>
                          <SelectItem value='15'>15 (Yuqori o'ng 2-premolyar)</SelectItem>
                          <SelectItem value='16'>16 (Yuqori o'ng 1-molyar)</SelectItem>
                          <SelectItem value='17'>17 (Yuqori o'ng 2-molyar)</SelectItem>
                          <SelectItem value='18'>18 (Yuqori o'ng aql tishi)</SelectItem>
                          <SelectItem value='21'>21 (Yuqori chap markaziy kurak)</SelectItem>
                          <SelectItem value='26'>26 (Yuqori chap 1-molyar)</SelectItem>
                          <SelectItem value='36'>36 (Pastki chap 1-molyar)</SelectItem>
                          <SelectItem value='46'>46 (Pastki o'ng 1-molyar)</SelectItem>
                          <SelectItem value='47'>47 (Pastki o'ng 2-molyar)</SelectItem>
                          <SelectItem value='48'>48 (Pastki o'ng aql tishi)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className='space-y-1.5'>
                      <label className='font-semibold text-muted-foreground'>Tashxis / Klinik Holat</label>
                      <Select value={selectedCondition} onValueChange={setSelectedCondition}>
                        <SelectTrigger className='h-9 text-xs'>
                          <SelectValue placeholder='Tashxisni tanlang' />
                        </SelectTrigger>
                        <SelectContent>
                          {CLINICAL_DIAGNOSES.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.title} ({d.icd10.split(' ')[0]})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className='space-y-1.5'>
                      <label className='font-semibold text-muted-foreground'>Bemor Shikoyati & Simptomlar</label>
                      <Input
                        placeholder="Masalan: Issiq-sovuqqa kuchli og'riq, tunda bezovta qiladi..."
                        value={symptomsInput}
                        onChange={(e) => setSymptomsInput(e.target.value)}
                        className='h-9 text-xs'
                      />
                    </div>

                    {/* Quick Symptom Chips */}
                    <div className='space-y-1 pt-1'>
                      <label className='text-[11px] font-semibold text-muted-foreground'>Tezkor Simptomlar (1-bosishda):</label>
                      <div className='flex flex-wrap gap-1'>
                        {[
                          '⚡ Sovuq/issiqqa kuchli og\'riq',
                          '🌙 Tungi simillovchi og\'riq',
                          '🔨 Chaynashda qattiq og\'rish',
                          '🩸 Milklarning qonashi',
                          '💔 Tish toji qattiq sinishi',
                        ].map((symptom, idx) => (
                          <button
                            key={idx}
                            type='button'
                            onClick={() => setSymptomsInput(symptom)}
                            className='text-[10px] px-2 py-1 rounded-md border bg-muted/30 hover:bg-primary/10 hover:border-primary/30 transition-colors text-muted-foreground hover:text-foreground'
                          >
                            {symptom}
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </div>

                <div className='p-4 border-t bg-muted/10'>
                  <Button
                    onClick={handleRunClinicalAnalysis}
                    disabled={isClinicalAnalyzing}
                    className='w-full text-xs font-bold gap-1.5 shadow'
                  >
                    <Sparkles className='h-4 w-4' />
                    {isClinicalAnalyzing ? "AI Tahlil Qilmoqda..." : "AI Davolash Rejasini Tuzish"}
                  </Button>
                </div>
              </Card>

              {/* Right Columns: Structured Clinical Protocol & Recommender */}
              <div className='lg:col-span-2 space-y-4'>
                {clinicalResult ? (
                  <Card className='shadow-sm border-primary/20 overflow-hidden'>
                    <CardHeader className='pb-3 bg-gradient-to-r from-primary/10 via-card to-emerald-500/10 border-b'>
                      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2'>
                        <div>
                          <div className='flex items-center gap-2'>
                            <Badge variant='outline' className='text-xs font-bold bg-primary/10 text-primary border-primary/30'>
                              {clinicalResult.icd10}
                            </Badge>
                            <Badge variant='secondary' className='text-[10px]'>
                              Tish: #{selectedTooth}
                            </Badge>
                            <Badge variant='default' className='text-[10px] bg-amber-600'>
                              {clinicalResult.urgency}
                            </Badge>
                          </div>
                          <CardTitle className='text-lg font-bold mt-2 text-foreground'>
                            {clinicalResult.title}
                          </CardTitle>
                        </div>

                        <div className='flex items-center gap-1.5'>
                          <Button
                            variant='outline'
                            size='sm'
                            className='h-8 text-xs gap-1 hover:bg-muted'
                            onClick={() => {
                              const planText = `${clinicalResult.title} (${clinicalResult.icd10}) - Tish #${selectedTooth}\n\nDavolash bosqichlari:\n${clinicalResult.steps.join('\n')}\n\nRetsept: ${clinicalResult.prescription}`
                              navigator.clipboard.writeText(planText)
                              toast.success("Davolash rejasi xotiraga nusxalandi!")
                            }}
                          >
                            <Copy className='h-3.5 w-3.5' /> Nusxa Olish
                          </Button>
                          <Button
                            size='sm'
                            className='h-8 text-xs gap-1'
                            onClick={handleAskAIChatAboutCase}
                          >
                            <Bot className='h-3.5 w-3.5' /> AI Chatga Yo'naltirish
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className='p-5 space-y-5 text-xs'>
                      {/* Treatment Protocol Steps */}
                      <div>
                        <h4 className='font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2.5'>
                          <CheckCircle2 className='h-4 w-4 text-primary' /> Bosqichma-bosqich Klinik Davolash Protokoli:
                        </h4>
                        <div className='rounded-xl border bg-muted/20 p-4 space-y-2 font-mono leading-relaxed text-foreground'>
                          {clinicalResult.steps.map((st: string, idx: number) => (
                            <div key={idx} className='flex items-start gap-2'>
                              <span>{st}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 2-column grid: Prescription & Materials */}
                      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        <div className='rounded-xl border bg-card p-4 space-y-1.5 shadow-2xs'>
                          <span className='font-bold text-muted-foreground flex items-center gap-1.5 uppercase text-[11px]'>
                            <Pill className='h-3.5 w-3.5 text-blue-500' /> Tavsiya Etilgan Retsept:
                          </span>
                          <p className='text-xs font-mono text-foreground leading-relaxed'>
                            {clinicalResult.prescription}
                          </p>
                        </div>

                        <div className='rounded-xl border bg-card p-4 space-y-1.5 shadow-2xs'>
                          <span className='font-bold text-muted-foreground flex items-center gap-1.5 uppercase text-[11px]'>
                            <Package className='h-3.5 w-3.5 text-emerald-500' /> Zarur Stomatologik Materiallar:
                          </span>
                          <p className='text-xs font-mono text-foreground leading-relaxed'>
                            {clinicalResult.materials}
                          </p>
                        </div>
                      </div>

                      {/* Patient Care Advice */}
                      <div className='rounded-xl border bg-amber-500/10 border-amber-500/30 p-3.5 flex items-start gap-2.5'>
                        <Lightbulb className='h-4 w-4 text-amber-600 shrink-0 mt-0.5' />
                        <div>
                          <span className='font-bold text-amber-800 dark:text-amber-400'>Bemorga Klinik Tavsiya & Parvarish:</span>
                          <p className='text-xs text-amber-900 dark:text-amber-300 mt-0.5'>
                            {clinicalResult.patientCare}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className='p-8 text-center text-muted-foreground text-xs'>
                    Tish va tashxisni tanlab, "AI Davolash Rejasini Tuzish" tugmasini bosing.
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* AI Inventory Analytics Tab */}
          <TabsContent value='inventory'>
            <Card className='shadow-sm'>
              <CardHeader>
                <CardTitle className='text-base font-bold flex items-center gap-2'>
                  <Package className='h-5 w-5 text-primary' /> Sun'iy Intelekt Sklad Tahlili & Tavsiyalar
                </CardTitle>
                <CardDescription className='text-xs'>
                  AI avtomatik ravishda kam qolgan sarflash materiallarini aniqlaydi va buyurtma tavsiyasini beradi.
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                {isInventoryLoading ? (
                  <div className='py-8 text-center text-xs text-muted-foreground animate-pulse'>
                    AI Sklad tahlili yuklanmoqda...
                  </div>
                ) : (
                  <>
                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                      <div className='rounded-xl border bg-muted/20 p-4'>
                        <span className='text-xs font-semibold text-muted-foreground'>Jami Material Turlari</span>
                        <p className='text-2xl font-bold font-mono mt-1'>{totalItemsCount}</p>
                      </div>

                      <div className='rounded-xl border bg-rose-500/10 border-rose-500/30 p-4'>
                        <span className='text-xs font-semibold text-rose-600 dark:text-rose-400'>Kritik Kam Qolgan Materiallar</span>
                        <p className='text-2xl font-bold font-mono mt-1 text-rose-600 dark:text-rose-400'>
                          {lowStockItemsCount} ta
                        </p>
                      </div>
                    </div>

                    <div className='space-y-2 border-t pt-4'>
                      <h4 className='text-xs font-bold uppercase tracking-wider text-muted-foreground'>
                        💡 AI Smart Recommendation (Tavsiya):
                      </h4>
                      <div className='p-4 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-xs font-mono leading-relaxed text-foreground'>
                        {aiRecommendation}
                      </div>
                    </div>

                    {Array.isArray(inventorySummary?.criticalItems) && inventorySummary.criticalItems.length > 0 && (
                      <div className='space-y-3 border-t pt-4'>
                        <h4 className='text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5'>
                          <AlertTriangle className='h-4 w-4' /> Shoshilinch Buyurtma Berilishi Kerak Bo'lgan Materiallar:
                        </h4>
                        <div className='rounded-xl border overflow-hidden'>
                          <table className='w-full text-left text-xs'>
                            <thead className='bg-muted/50 text-muted-foreground font-semibold border-b'>
                              <tr>
                                <th className='p-3'>Material Nomi</th>
                                <th className='p-3'>Joriy Zaxira</th>
                                <th className='p-3'>Minimal Chegara</th>
                                <th className='p-3'>Holat</th>
                              </tr>
                            </thead>
                            <tbody className='divide-y'>
                              {inventorySummary.criticalItems.map((item: any) => (
                                <tr key={String(item.id || item.name)} className='hover:bg-muted/20'>
                                  <td className='p-3 font-bold text-foreground'>{String(item.name || '')}</td>
                                  <td className='p-3 font-mono font-bold text-rose-600 dark:text-rose-400'>
                                    {Number(item.quantityInStock ?? item.quantity_in_stock ?? 0)} {String(item.unit || '')}
                                  </td>
                                  <td className='p-3 font-mono text-muted-foreground'>
                                    {Number(item.minimumThreshold ?? item.minimum_threshold ?? 0)} {String(item.unit || '')}
                                  </td>
                                  <td className='p-3'>
                                    <Badge variant='destructive' className='text-[10px]'>
                                      Kritik kam
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Permissions Config Tab */}
          {isBoshShifokor && (
            <TabsContent value='permissions'>
              <Card className='shadow-sm'>
                <CardHeader>
                  <CardTitle className='text-base font-bold flex items-center gap-2'>
                    <Shield className='h-5 w-5 text-primary' /> Rollar bo'yicha AI Ma'lumot Ruxsatlari
                  </CardTitle>
                  <CardDescription className='text-xs'>
                    Bosh Shifokor sifatida turli lavozimdagi xodimlar AI yordamchisida qaysi ma'lumotlarni ko'ra olishini boshqaring.
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-6'>
                  {permissionsList.length === 0 ? (
                    <div className='text-xs text-muted-foreground italic text-center py-6'>
                      AI ruxsatlar sozlamalari yuklanmoqda yoki ruxsatlar mavjud emas...
                    </div>
                  ) : (
                    permissionsList.map((p: any) => {
                      const roleLabel =
                        p.role === 'bosh_shifokor'
                          ? 'Bosh Shifokor'
                          : p.role === 'administrator' || p.role === 'admin'
                          ? 'Administrator (Retseptsiya)'
                          : p.role === 'doctor'
                          ? 'Shifokor (Doctor)'
                          : 'Xodim'

                      return (
                        <div
                          key={String(p.id || p.role)}
                          className='rounded-xl border bg-muted/20 p-5 space-y-4 shadow-xs'
                        >
                          <div className='flex items-center justify-between border-b pb-3'>
                            <div>
                              <div className='flex items-center gap-2'>
                                <span className='font-bold text-sm text-foreground'>{roleLabel}</span>
                                <Badge variant='outline' className='text-[10px] uppercase font-mono'>
                                  {String(p.role || '')}
                                </Badge>
                              </div>
                              <p className='text-xs text-muted-foreground mt-0.5'>
                                Ushbu rolga ega foydalanuvchilar uchun AI ma'lumot olish chegaralari
                              </p>
                            </div>
                          </div>

                          <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs'>
                            {/* Toggle 1: Financial Reports */}
                            <div className='flex items-center justify-between p-3 rounded-lg border bg-card'>
                              <div className='space-y-0.5 me-3'>
                                <span className='font-semibold text-foreground'>💰 Moliyaviy Hisobotlar</span>
                                <p className='text-[11px] text-muted-foreground'>Kassa tushumi va to'lovlar statistikasi</p>
                              </div>
                              <Switch
                                checked={Boolean(p.canViewFinancialReports)}
                                onCheckedChange={(checked) =>
                                  updatePermissionMutation.mutate({ id: String(p.id), canViewFinancialReports: checked })
                                }
                              />
                            </div>

                            {/* Toggle 2: Inventory Costs */}
                            <div className='flex items-center justify-between p-3 rounded-lg border bg-card'>
                              <div className='space-y-0.5 me-3'>
                                <span className='font-semibold text-foreground'>📦 Ombor Narxlari</span>
                                <p className='text-[11px] text-muted-foreground'>Sklad qiymati va narxlash tahlillari</p>
                              </div>
                              <Switch
                                checked={Boolean(p.canViewInventoryCosts)}
                                onCheckedChange={(checked) =>
                                  updatePermissionMutation.mutate({ id: String(p.id), canViewInventoryCosts: checked })
                                }
                              />
                            </div>

                            {/* Toggle 3: Other Doctors Stats */}
                            <div className='flex items-center justify-between p-3 rounded-lg border bg-card'>
                              <div className='space-y-0.5 me-3'>
                                <span className='font-semibold text-foreground'>👨‍⚕️ Boshqa Shifokorlar Statistikasi</span>
                                <p className='text-[11px] text-muted-foreground'>Hamkasblarining qabullari va KPI ma'lumoti</p>
                              </div>
                              <Switch
                                checked={Boolean(p.canViewOtherDoctorsStats)}
                                onCheckedChange={(checked) =>
                                  updatePermissionMutation.mutate({ id: String(p.id), canViewOtherDoctorsStats: checked })
                                }
                              />
                            </div>

                            {/* Toggle 4: All Patients */}
                            <div className='flex items-center justify-between p-3 rounded-lg border bg-card'>
                              <div className='space-y-0.5 me-3'>
                                <span className='font-semibold text-foreground'>👥 Barcha Bemorlar Kartalari</span>
                                <p className='text-[11px] text-muted-foreground'>Klinikadagi barcha bemorlar qidiruvi va tarixi</p>
                              </div>
                              <Switch
                                checked={Boolean(p.canViewAllPatients)}
                                onCheckedChange={(checked) =>
                                  updatePermissionMutation.mutate({ id: String(p.id), canViewAllPatients: checked })
                                }
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </Main>
    </>
  )
}

function formatDateSafely(dateStr: string) {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return String(dateStr)
    return format(d, 'HH:mm')
  } catch {
    return String(dateStr)
  }
}
