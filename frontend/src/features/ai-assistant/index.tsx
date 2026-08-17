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

export function AIAssistantPage() {
  const { data: user } = useMe()
  const chatMutation = useAIChat()
  const { data: inventorySummary, isLoading: isInventoryLoading } = useAIInventorySummary()
  const { data: permissionsData = [] } = useAIPermissions()
  const updatePermissionMutation = useUpdateAIPermission()

  const permissionsList = Array.isArray(permissionsData?.results)
    ? permissionsData.results
    : Array.isArray(permissionsData)
    ? permissionsData
    : []

  const [inputMessage, setInputMessage] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  
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
      text: `Assalomu alaykum, ${user?.firstName || user?.first_name || 'Foydalanuvchi'}! Men DentaCRM aqlli Sun'iy Intelekt (AI) yordamchisiman. 🤖✨\n\nKlinikangizdagi bemorlar, kassa tushumi, shifokorlar jadvali va sklad zaxiralari bo'yicha har qanday savolingizga real-vaqt rejimida javob bera olaman. Sizga qanday yordam bera olaman?`,
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
        text: response.message || (response as Record<string, unknown>).answer || 'Javob shakllantirilmadi.',
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

  const isBoshShifokor = user?.role === 'bosh_shifokor' || user?.role === 'admin'

  const totalItemsCount = inventorySummary?.totalItemsCount ?? inventorySummary?.total_items_count ?? 0
  const lowStockItemsCount = inventorySummary?.lowStockItemsCount ?? inventorySummary?.low_stock_items_count ?? 0
  const aiRecommendation = inventorySummary?.aiRecommendation || inventorySummary?.ai_recommendation || "Barcha zaxira materiallari yetarli darajada. Sklad holati a'lo!"

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

        <Tabs defaultValue='chat' className='space-y-4'>
          <TabsList>
            <TabsTrigger value='chat' className='flex items-center gap-1.5'>
              <Bot className='h-4 w-4' /> AI Chatbot
            </TabsTrigger>
            <TabsTrigger value='inventory' className='flex items-center gap-1.5'>
              <Package className='h-4 w-4' /> AI Sklad Tahlili
            </TabsTrigger>
            {isBoshShifokor && (
              <TabsTrigger value='permissions' className='flex items-center gap-1.5'>
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
                          text: `Suhbat tozalandi. Sizga yana qanday yordam bera olaman, ${user?.firstName || user?.first_name || ''}?`,
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
                              {inventorySummary.criticalItems.map((item: Record<string, unknown>) => (
                                <tr key={item.id || item.name} className='hover:bg-muted/20'>
                                  <td className='p-3 font-bold text-foreground'>{item.name}</td>
                                  <td className='p-3 font-mono font-bold text-rose-600 dark:text-rose-400'>
                                    {item.quantityInStock ?? item.quantity_in_stock} {item.unit}
                                  </td>
                                  <td className='p-3 font-mono text-muted-foreground'>
                                    {item.minimumThreshold ?? item.minimum_threshold} {item.unit}
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
                    permissionsList.map((p: Record<string, unknown>) => {
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
                          key={p.id || p.role}
                          className='rounded-xl border bg-muted/20 p-5 space-y-4 shadow-xs'
                        >
                          <div className='flex items-center justify-between border-b pb-3'>
                            <div>
                              <div className='flex items-center gap-2'>
                                <span className='font-bold text-sm text-foreground'>{roleLabel}</span>
                                <Badge variant='outline' className='text-[10px] uppercase font-mono'>
                                  {p.role}
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
                                  updatePermissionMutation.mutate({ id: p.id, canViewFinancialReports: checked })
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
                                  updatePermissionMutation.mutate({ id: p.id, canViewInventoryCosts: checked })
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
                                  updatePermissionMutation.mutate({ id: p.id, canViewOtherDoctorsStats: checked })
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
                                  updatePermissionMutation.mutate({ id: p.id, canViewAllPatients: checked })
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
