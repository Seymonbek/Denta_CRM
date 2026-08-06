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
} from 'lucide-react'
import { format } from 'date-fns'
import {
  useAIChat,
  useAIInventorySummary,
  useAIPermissions,
  useUpdateAIPermission,
} from '@/api/hooks/use-ai'
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
  const { data: permissions = [] } = useAIPermissions()
  const updatePermissionMutation = useUpdateAIPermission()

  const [inputMessage, setInputMessage] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
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
        text: response.message || 'Kechirasiz, javob olishda xatolik yuz berdi.',
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

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <Sparkles className='h-5 w-5 text-primary animate-pulse' />
          <span>🤖 DentaCRM AI Smart Assistant</span>
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
                      placeholder="Savolingizni kiriting (Masalan: Bugun nechta bemor keldi?)..."
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      className='text-xs flex-1 h-10'
                      disabled={chatMutation.isPending}
                    />
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
                        <p className='text-2xl font-bold font-mono mt-1'>{inventorySummary?.totalItemsCount || 0}</p>
                      </div>

                      <div className='rounded-xl border bg-rose-500/10 border-rose-500/30 p-4'>
                        <span className='text-xs font-semibold text-rose-600 dark:text-rose-400'>Kritik Kam Qolgan Materiallar</span>
                        <p className='text-2xl font-bold font-mono mt-1 text-rose-600 dark:text-rose-400'>
                          {inventorySummary?.lowStockItemsCount || 0} ta
                        </p>
                      </div>
                    </div>

                    <div className='space-y-2 border-t pt-4'>
                      <h4 className='text-xs font-bold uppercase tracking-wider text-muted-foreground'>
                        💡 AI Smart Recommendation (Tavsiya):
                      </h4>
                      <div className='p-4 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-xs font-mono leading-relaxed text-foreground'>
                        {inventorySummary?.aiRecommendation || "Barcha zaxira materiallari yetarli darajada. Sklad holati a'lo!"}
                      </div>
                    </div>
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
                    <Shield className='h-5 w-5 text-primary' /> Rollar bo'yicha AI Ruxsatlari
                  </CardTitle>
                  <CardDescription className='text-xs'>
                    Qaysi lavozimdagi xodimlar AI yordamchisidan foydalana olishini boshqaring.
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {permissions.map((p) => {
                    const roleLabel =
                      p.role === 'bosh_shifokor'
                        ? 'Bosh Shifokor'
                        : p.role === 'admin'
                        ? 'Administrator'
                        : p.role === 'doctor'
                        ? 'Shifokor (Doctor)'
                        : 'Retseptsiya (Reception)'

                    return (
                      <div
                        key={p.id}
                        className='flex items-center justify-between rounded-xl border bg-muted/20 p-4'
                      >
                        <div>
                          <span className='font-bold text-sm'>{roleLabel}</span>
                          <p className='text-xs text-muted-foreground font-mono'>Role code: {p.role}</p>
                        </div>
                        <Switch
                          checked={p.enabled}
                          onCheckedChange={(checked) =>
                            updatePermissionMutation.mutate({ id: p.id, enabled: checked })
                          }
                        />
                      </div>
                    )
                  })}
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
