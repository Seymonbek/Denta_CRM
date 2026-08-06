# DentaCRM — Dasturchilar uchun to'liq texnik topshiriq (TZ)

**Versiya:** 1.0 (developer edition) · **Sana:** 2026-yil 2-iyul
**Manba:** `DentaCRM_TZ (2).docx` — mijoz/foydalanuvchi uchun mahsulot tavsifi hujjati asosida tayyorlandi

---

## 0. Hujjat haqida

Bu hujjat mijozga mo'ljallangan "mahsulot tavsifi" hujjatidagi HAR BIR funksional talabni dasturchi amalga oshira oladigan darajaga tushiradi: qaysi texnologiya, qaysi modul, qaysi model, qaysi endpoint, qaysi fayl. Maqsad — kod yozishni boshlashda hech qanday "bu qanday ishlashi kerak edi?" degan savol qolmasligi.

Arxitektura tanlovi (Django 5 + DRF + Aiogram 3.x + Celery + PostgreSQL + Redis, modular monolith) — sen avval belgilagan stackka mos qilib yozildi.

---

## 1. Umumiy arxitektura

DentaCRM — **modular monolith**: bitta Django loyihasi ichida bir-biridan aniq ajratilgan `apps/` modullar, lekin bitta deploy birligi sifatida ishlaydi. Bu bosqichda mikroservisga o'tish shart emas — bitta klinika miqyosida ortiqcha murakkablik bo'lardi.

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                            │
│   React SPA (Bosh shifokor / Doktor / Administrator panellari)   │
│                    Telegram (bemor va xodim botlari)              │
└───────────────────────┬───────────────────────┬──────────────────┘
                         │ HTTPS/REST (JWT)      │ Telegram Bot API
                         ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     APPLICATION LAYER                            │
│  Django 5 + DRF (Gunicorn/Uvicorn)     Aiogram 3.x bot (polling/  │
│  — REST API                             webhook, alohida process) │
└───────────────────────┬───────────────────────┬──────────────────┘
                         │                       │
              ┌──────────┴──────────┐   ┌────────┴─────────┐
              ▼                     ▼   ▼                  ▼
      ┌───────────────┐   ┌────────────────┐    ┌────────────────┐
      │  PostgreSQL 16 │   │  Redis 7       │    │  Object Storage │
      │  (asosiy DB)   │   │  (cache, Celery│    │  (S3 / MinIO)   │
      │                │   │  broker, pub/sub)   │  rasm, rentgen  │
      └───────────────┘   └───────┬────────┘    └────────────────┘
                                   │
                          ┌────────┴────────┐
                          │ Celery worker +  │
                          │ Celery beat      │
                          │ (async vazifalar,│
                          │ eslatmalar, backup)│
                          └──────────────────┘
```

**Asosiy oqim:** Frontend/Telegram bot → DRF API → Service layer (business logika) → Model/ORM → PostgreSQL. Uzoq/kechiktirilgan ishlar (eslatma yuborish, backup, hisobot generatsiyasi) Celery orqali asinxron bajariladi. Telegram botga xabar yuborish signal → Celery task → Aiogram bot instance (Redis pub/sub orqali) zanjiri bilan ishlaydi, shunda API request botni kutib turmaydi.

**Qatlamlar (har bir app ichida):**
```
models.py        → ma'lumotlar tuzilishi
selectors.py     → faqat o'qish uchun query funksiyalar (murakkab filter/aggregate)
services.py      → yozish/business-logika (masalan: navbat yaratish, to'lov qabul qilish)
serializers.py   → validatsiya + JSON shakl
permissions.py   → rolga asoslangan ruxsatlar
views.py         → DRF ViewSet/APIView — faqat orkestratsiya, logika yo'q
tasks.py         → Celery vazifalari
signals.py       → model o'zgarganda avtomatik reaksiyalar (masalan sklad kamayishi)
```

---

## 2. Texnologik stack

### Backend
| Qatlam | Texnologiya | Izoh |
|---|---|---|
| Til | Python 3.12 | |
| Framework | Django 5.x + Django REST Framework | |
| Autentifikatsiya | `djangorestframework-simplejwt` | JWT access/refresh |
| Ma'lumotlar bazasi | PostgreSQL 16 | `ExclusionConstraint` — double-booking uchun |
| Cache / broker | Redis 7 | Celery broker + result backend + DRF cache |
| Fon vazifalari | Celery 5.x + Celery Beat | eslatmalar, backup, hisobotlar |
| Telegram bot | Aiogram 3.x | FSM, middleware, routers |
| API hujjatlashtirish | `drf-spectacular` | Swagger/OpenAPI 3 |
| Filtrlash | `django-filter` | |
| Rasm bilan ishlash | Pillow | thumbnail, siqish |
| Fayl saqlash | `django-storages` + S3/MinIO | rasm, rentgen, backup |
| Audit log | `django-simple-history` | kim nimani o'zgartirdi |
| Test | `pytest-django`, `factory_boy` | |
| Konteynerlash | Docker + Docker Compose | |
| Web server | Nginx + Gunicorn (ASGI kerak bo'lsa Uvicorn) | |

### Frontend
| Qatlam | Texnologiya | Izoh |
|---|---|---|
| Framework | React 18 + TypeScript | |
| Build tool | Vite | |
| Stil | TailwindCSS + shadcn/ui | |
| Server-state | TanStack Query (React Query) | API cache, refetch, optimistic update |
| Local/UI-state | Zustand | auth, sidebar, modal holatlari |
| Formalar | React Hook Form + Zod | validatsiya backend bilan bir xil qoidada |
| HTTP client | Axios (interceptor bilan avto-refresh token) | |
| Routing | React Router v6 | rol asosida himoyalangan route'lar |
| Grafiklar | Recharts | hisobot/dashboard |
| Sana | date-fns | |
| Odontogram | Custom SVG component (React) | interaktiv tish xaritasi |

### Infra
Docker Compose (dev/staging), GitHub Actions (CI/CD), Sentry (xatoliklarni kuzatish), MinIO (lokal S3-mos storage, agar bulutga chiqilmasa).

---

## 3. Repository / fayl tuzilishi

```
dentacrm/
├── backend/
│   ├── config/                     # Django settings
│   │   ├── settings/
│   │   │   ├── base.py
│   │   │   ├── dev.py
│   │   │   └── prod.py
│   │   ├── urls.py
│   │   ├── celery.py
│   │   └── asgi.py / wsgi.py
│   ├── apps/
│   │   ├── core/                   # BaseModel, umumiy permission/util
│   │   ├── accounts/                # User, rollar, JWT
│   │   ├── departments/
│   │   ├── doctors/                 # profil, ish jadvali, komissiya sozlamalari
│   │   ├── patients/
│   │   ├── scheduling/              # navbat, procedure_type
│   │   ├── treatments/              # davolanish yozuvi
│   │   ├── odontogram/
│   │   ├── prescriptions/
│   │   ├── inventory/                # sklad
│   │   ├── payments/                 # to'lov, komissiya
│   │   ├── ratings/                  # ball, nishon
│   │   ├── notifications/
│   │   ├── reports/                  # dashboard uchun aggregate query'lar
│   │   └── telegram_bot/             # aiogram routerlar, handlerlar
│   ├── tests/
│   ├── manage.py
│   ├── requirements/
│   │   ├── base.txt
│   │   ├── dev.txt
│   │   └── prod.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/                     # har modul uchun axios funksiyalari
│   │   ├── app/                      # router, providers, layout
│   │   ├── components/
│   │   │   ├── ui/                   # shadcn komponentlar
│   │   │   ├── odontogram/
│   │   │   ├── calendar/
│   │   │   ├── patient-card/
│   │   │   └── charts/
│   │   ├── pages/
│   │   │   ├── bosh-shifokor/
│   │   │   ├── doctor/
│   │   │   └── administrator/
│   │   ├── hooks/
│   │   ├── store/                    # zustand: auth, ui
│   │   ├── types/                    # backend serializerlarga mos TS interfeyslar
│   │   └── utils/
│   ├── index.html
│   ├── vite.config.ts
│   └── Dockerfile
├── docker-compose.yml
├── docker-compose.prod.yml
└── .github/workflows/ci.yml
```

---

## 4. Backend — Django ilovalari (apps)

### 4.1 `core`
Umumiy `BaseModel` (`id: UUID`, `created_at`, `updated_at`, `is_active`), umumiy exception handler, umumiy pagination class (`PageNumberPagination`, `page_size=20`), umumiy permission bazasi (`RolePermission`).

### 4.2 `accounts`
**Modellar**

| Model | Maydonlar | Izoh |
|---|---|---|
| `User` (AbstractUser'dan meros) | `phone_number` (unique, login sifatida), `first_name`, `last_name`, `role` (`bosh_shifokor` / `doctor` / `administrator`), `telegram_chat_id` (null), `two_factor_enabled` (bool), `is_active` | Login — telefon raqami + parol |
| `OTPCode` | `user` FK, `code`, `purpose` (`login_2fa`), `expires_at`, `is_used` | 2FA uchun ixtiyoriy |

**Business-logika:** JWT login (`SimpleJWT`), rol asosida `permission_classes`, parolni tiklash (SMS orqali, ixtiyoriy).

### 4.3 `departments`
| Model | Maydonlar |
|---|---|
| `Department` | `name`, `description`, `created_by` FK(User), `is_active` |

Bosh shifokor CRUD qila oladi. Boshqa hech kim yozolmaydi (4-band jadvaliga mos).

### 4.4 `doctors`
| Model | Maydonlar | Izoh |
|---|---|---|
| `DoctorProfile` | `user` OneToOne, `departments` M2M(Department), `specialization`, `bio`, `commission_basis` (`from_total`/`from_net`), `default_commission_rate` (decimal), `can_view_other_doctors` (bool) | |
| `WorkingHours` | `doctor` FK, `weekday` (0–6), `start_time`, `end_time` | haftalik doimiy jadval |
| `TimeOff` | `doctor` FK, `date_start`, `date_end`, `reason` | ta'til/dam olish |
| `ProcedureType` | `name`, `department` FK, `default_duration_minutes`, `default_price`, `commission_rate_override` (null) | muolaja turi + narx + davomiylik |

**Business-logika:** `WorkingHours` + `TimeOff` asosida bo'sh vaqt oralig'ini hisoblab beruvchi `selectors.get_available_slots(doctor, date)` funksiyasi — bu `scheduling` app'idagi navbat yaratishda ishlatiladi.

### 4.5 `patients`
| Model | Maydonlar |
|---|---|
| `Patient` | `first_name`, `last_name`, `phone_number`, `gender` (null), `address` (null), `notes` (allergiya/surunkali kasallik — text), `telegram_chat_id` (null), `created_by` FK(User) |

`first_visit_date`, `last_visit_date`, "davolangan bo'limlar" va "davolagan shifokorlar" ro'yxati — **saqlanmaydi, `selectors.py`da appointment/treatment tarixidan hisoblab chiqariladi** (denormalizatsiyadan qochish uchun; kerak bo'lsa keyinchalik cache qilinadi).

### 4.6 `scheduling`
| Model | Maydonlar | Izoh |
|---|---|---|
| `Appointment` | `patient` FK, `doctor` FK, `department` FK, `procedure_type` FK(null), `scheduled_start`, `scheduled_end`, `status` (`scheduled`/`confirmed`/`in_progress`/`completed`/`cancelled`/`no_show`), `created_by` FK(User), `reminder_1d_sent`, `reminder_2h_sent` | |

**Muhim:** double-booking'ni **DB darajasida** oldini olish uchun PostgreSQL `ExclusionConstraint` (`btree_gist` extension) ishlatiladi — `(doctor_id, tstzrange(scheduled_start, scheduled_end))` bo'yicha. Bu — faqat application-level tekshiruvga (`if` shart) ishonib qolmaslik uchun eng muhim texnik detal.

### 4.7 `treatments`
| Model | Maydonlar |
|---|---|
| `Treatment` | `appointment` FK, `doctor` FK, `patient` FK, `department` FK, `procedure_type` FK, `diagnosis` (text), `description` (text), `price` (decimal), `payment_status` (`unpaid`/`partial`/`paid`), `stage` (`in_progress`/`completed`), `created_at` |
| `TreatmentPhoto` | `treatment` FK, `photo_type` (`before`/`after`/`xray`), `image` (ImageField → S3), `uploaded_at` |

Signal: `Treatment` yaratilganda/yangilanganda → `notifications` app orqali bildirishnoma + `ratings` app orqali ball qo'shish.

### 4.8 `odontogram`
| Model | Maydonlar |
|---|---|
| `ToothRecord` | `treatment` FK, `tooth_number` (FDI, 11–48 choices), `procedure` (`filling`/`root_canal`/`extraction`/`crown`/...), `status` (`healthy`/`treated`/`missing`/`planned`), `notes` |

Frontendda 32 ta tishning holatini rangli SVG orqali chizish uchun `GET /patients/{id}/odontogram/` — bemorning barcha tishlari bo'yicha eng so'nggi holat qaytariladi (har bir tooth_number bo'yicha `latest()`).

### 4.9 `prescriptions`
| Model | Maydonlar |
|---|---|
| `PrescriptionTemplate` | `name`, `content` (text), `created_by` FK(DoctorProfile) |
| `Prescription` | `treatment` FK, `template` FK(null), `content` (text, tahrirlanadi), `sent_to_telegram_at` (null) |

Saqlanganda Celery task orqali bemorning `telegram_chat_id`'ga yuboriladi.

### 4.10 `inventory` (Sklad)
| Model | Maydonlar |
|---|---|
| `Material` | `name`, `unit` (`gram`/`piece`/`ml`), `quantity_in_stock` (decimal), `minimum_threshold`, `unit_cost` (null) |
| `MaterialUsage` | `treatment` FK, `material` FK, `quantity_used` |
| `MaterialStockLog` | `material` FK, `change_amount`, `reason` (`usage`/`restock`/`adjustment`), `related_treatment` FK(null), `created_at` |

Signal: `MaterialUsage` yaratilganda → `Material.quantity_in_stock` kamayadi + `MaterialStockLog` yoziladi + agar `quantity_in_stock < minimum_threshold` bo'lsa `notifications` task chaqiriladi.

### 4.11 `payments`
| Model | Maydonlar |
|---|---|
| `Payment` | `treatment` FK, `patient` FK, `amount`, `method` (`cash`/`card`/`payme`/`click`/`bank_transfer`), `received_by` FK(User), `created_at` |
| `CommissionRecord` | `doctor` FK, `treatment` FK, `amount` (hisoblangan), `basis` (`from_total`/`from_net`), `calculated_at` |

**Komissiya formulasi (`services.calculate_commission`):**
```
rate = procedure_type.commission_rate_override or doctor.default_commission_rate
base = treatment.price if basis == "from_total" else (treatment.price - material_cost)
commission = base * rate / 100
```
Qarzdorlik — saqlanmaydi, `treatment.price - sum(payments)` orqali real vaqtda hisoblanadi.

### 4.12 `ratings`
| Model | Maydonlar |
|---|---|
| `ScoreLog` | `doctor` FK, `points`, `reason` (`new_patient`/`treatment_completed`/`photo_uploaded`/`activity_streak`), `created_at` |
| `Badge` | `name`, `description`, `icon` |
| `DoctorBadge` | `doctor` FK, `badge` FK, `period` (masalan "2026-07"), `awarded_at` |

Reyting — `ScoreLog.objects.filter(doctor=x).aggregate(Sum('points'))`; leaderboard — barcha shifokorlar bo'yicha shu yig'indi tartiblangan holda.

### 4.13 `notifications`
| Model | Maydonlar |
|---|---|
| `NotificationLog` | `user` FK(null), `patient` FK(null), `type` (`new_patient`/`treatment_updated`/`payment_received`/`low_stock`/`rating_achievement`/`appointment_reminder_1d`/`appointment_reminder_2h`/`prescription_sent`/`followup_invite`), `channel` (`telegram`), `message`, `status` (`pending`/`sent`/`failed`), `sent_at` |

Barcha yuborilgan xabarlar shu yerda log qilinadi — bu debugging va "xabar yetib bordimi" nazorati uchun kerak.

### 4.14 `reports`
Alohida modelga ega emas — faqat `selectors.py` ichida aggregate query'lar: kunlik/haftalik/oylik bemorlar soni, eng ko'p muolaja turlari, shifokor unumdorligi, umumiy daromad dinamikasi, material sarfi, bo'lim kesimida statistika. Natijalar Redis'da qisqa muddat (masalan 5 daqiqa) cache qilinadi — dashboard tez ochilishi uchun.

### 4.15 `telegram_bot`
Aiogram 3.x — routerlar, FSM, middleware. Batafsil 8-bo'limda.

---

## 5. Ma'lumotlar bazasi — bog'lanishlar xulosasi

```
User (1) ─── (1) DoctorProfile ─── (M) WorkingHours
                       │  └── (M) TimeOff
                       └── (M2M) Department

Patient (1) ─── (M) Appointment ─── (1) Treatment ─── (M) TreatmentPhoto
                     │                     ├── (M) ToothRecord
                     │                     ├── (1) Prescription
                     │                     ├── (M) MaterialUsage ─── (1) Material
                     │                     └── (M) Payment ─── (1) CommissionRecord

Doctor ─── (M) ScoreLog          Doctor ─── (M) DoctorBadge ─── (1) Badge
```

Har bir FK'da `on_delete=models.PROTECT` tavsiya etiladi (tibbiy/moliyaviy yozuvlar tasodifan o'chib ketmasligi uchun); faqat log jadvallarida (`NotificationLog`, `MaterialStockLog`) `SET_NULL` mumkin.

---

## 6. API arxitekturasi

Barcha endpointlar `/api/v1/` prefiksi bilan, JWT bilan himoyalangan, `drf-spectacular` orqali avtomatik Swagger (`/api/docs/`).

| Modul | Asosiy endpointlar |
|---|---|
| accounts | `POST /auth/login/`, `POST /auth/refresh/`, `GET /auth/me/` |
| departments | `GET/POST /departments/`, `PATCH/DELETE /departments/{id}/` |
| doctors | `GET/POST /doctors/`, `GET/PATCH /doctors/{id}/`, `GET/POST /doctors/{id}/working-hours/`, `GET/POST /doctors/{id}/time-off/`, `GET /doctors/{id}/available-slots/?date=` |
| procedure-types | `GET/POST /procedure-types/` |
| patients | `GET/POST /patients/`, `GET/PATCH /patients/{id}/`, `GET /patients/{id}/history/` (to'liq timeline), `GET /patients/{id}/odontogram/` |
| scheduling | `GET/POST /appointments/`, `PATCH /appointments/{id}/`, `POST /appointments/{id}/cancel/` |
| treatments | `GET/POST /treatments/`, `PATCH /treatments/{id}/`, `POST /treatments/{id}/photos/`, `POST /treatments/{id}/tooth-records/` |
| prescriptions | `GET/POST /prescription-templates/`, `POST /treatments/{id}/prescription/` |
| inventory | `GET/POST /materials/`, `PATCH /materials/{id}/restock/`, `GET /materials/{id}/logs/` |
| payments | `GET/POST /payments/`, `GET /patients/{id}/balance/`, `GET /doctors/{id}/commissions/?from=&to=` |
| ratings | `GET /ratings/leaderboard/`, `GET /doctors/{id}/badges/` |
| reports | `GET /reports/dashboard/?period=`, `GET /reports/revenue/`, `GET /reports/procedures/`, `GET /reports/departments/` |

**Serializer strategiyasi:** har bir modulda `ListSerializer` (yengil, ro'yxat uchun) va `DetailSerializer`/`WriteSerializer` (to'liq, nested) alohida — N+1 muammosini oldini olish uchun `select_related`/`prefetch_related` `selectors.py`da markazlashtiriladi.

---

## 7. Autentifikatsiya va ruxsatlar (RBAC)

Har bir `ViewSet`da `get_permissions()` orqali rolga qarab dinamik ruxsat beriladi. Asosiy klasslar:

```python
class IsBoshShifokor(BasePermission): ...
class IsDoctor(BasePermission): ...
class IsAdministrator(BasePermission): ...
class IsOwnerDoctorOrPermitted(BasePermission):
    # doktor faqat o'z bemorini/yozuvini ko'radi,
    # basher can_view_other_doctors=True bo'lsa — hammasini ko'radi
```

TZ'dagi ruxsatlar jadvali to'g'ridan-to'g'ri shu klasslarga map qilinadi:

| Amal | Bosh shifokor | Doktor | Administrator |
|---|---|---|---|
| Bemor ro'yxatga olish/navbat | ✅ | ❌ | ✅ |
| Ish jadvalini boshqarish | ✅ (hammasi) | faqat o'ziniki | ✅ |
| Davolanish yozuvi | ✅ | ✅ | ❌ |
| Dastlabki to'lov | ✅ | ✅ | ✅ |
| Barcha shifokorlar ishini ko'rish | ✅ | ruxsat berilsa | ❌ |
| Shifokor/bo'lim qo'shish-o'chirish | ✅ | ❌ | ❌ |
| Umumiy moliyaviy hisobot | ✅ | ❌ | ❌ |

---

## 8. Telegram bot arxitekturasi (Aiogram 3.x)

**Ikkita oqim:**
1. **Xodimlar uchun** (bosh shifokor, doktor) — hisobga bog'langan `telegram_chat_id` orqali bildirishnoma qabul qiladi.
2. **Bemorlar uchun** — faqat bir tomonlama xabarnoma kanali (eslatma, retsept, follow-up taklif).

```
apps/telegram_bot/
├── bot.py            # Bot(), Dispatcher() instance
├── routers/
│   ├── staff.py       # /start, hisobni chat_id bilan bog'lash (tasdiqlash kodi orqali)
│   └── patient.py     # /start, telefon raqamini so'rash (contact share), bog'lash
├── states.py          # FSM: PhoneVerification
├── middlewares.py      # throttling, logging, DB session
├── keyboards.py
└── dispatcher_runner.py   # alohida process sifatida polling (yoki webhook)
```

**Integratsiya Django bilan:** bot alohida process (`python -m apps.telegram_bot.dispatcher_runner`), lekin bir xil Django ORM'ga ulanadi (`DJANGO_SETTINGS_MODULE` orqali standalone script sifatida ishga tushiriladi) — shunda `Patient`/`User` modellariga to'g'ridan-to'g'ri yoza oladi.

**Xabar yuborish oqimi:** Django signal (masalan `Treatment.post_save`) → `notifications.tasks.send_notification.delay(...)` (Celery) → task Redis orqali botga topshiriq beradi yoki to'g'ridan-to'g'ri Aiogram `Bot.send_message()` chaqiradi (bot instance shared bo'lsa). Bu yondashuv API requestni bloklamaydi.

---

## 9. Celery — asinxron vazifalar

| Task | Trigger/jadval | Vazifa |
|---|---|---|
| `send_appointment_reminder_1day` | Celery Beat, har soatda | Ertangi navbatlar uchun eslatma |
| `send_appointment_reminder_2hour` | Celery Beat, har 15 daqiqada | 2 soat qolgan navbatlar uchun eslatma |
| `send_followup_invite` | Celery Beat, kuniga 1 marta | Profilaktik muddat (masalan 6 oy) o'tgan bemorlarga taklif |
| `check_low_stock` | Signal (`MaterialUsage` yaratilganda) | Minimal chegaradan pastga tushsa — bildirishnoma |
| `send_notification` | Signal (turli hodisalar) | `NotificationLog` yaratish + Telegram orqali yuborish |
| `generate_dashboard_cache` | Celery Beat, har 5 daqiqada | Og'ir aggregate query natijalarini Redis'da yangilash |
| `backup_database` | Celery Beat, kuniga 1 marta | `pg_dump` → S3/MinIO'ga yuklash |
| `process_treatment_photo` | Signal (`TreatmentPhoto` yaratilganda) | Thumbnail generatsiya, siqish |

---

## 10. Media va fayllar saqlash

Barcha rasm/rentgen — `django-storages` orqali S3-mos storage'ga (ishlab chiqarishda AWS S3 yoki self-hosted MinIO). Lokal diskda saqlash **tavsiya etilmaydi** (backup va scale muammolari). Yuklashda: original + thumbnail (300px) ikkalasi ham saqlanadi — frontendda ro'yxatda thumbnail, detailda original ko'rsatiladi.

---

## 11. Frontend arxitekturasi

**Rol asosidagi sahifalar:**

| Bosh shifokor | Doktor | Administrator |
|---|---|---|
| Dashboard (umumiy statistika, grafiklar) | Bugungi navbatlarim | Kunlik navbat jadvali |
| Shifokorlar ro'yxati/qo'shish | Bemorlarim + tarix | Yangi bemor qo'shish |
| Bo'limlar boshqaruvi | Odontogram + davolanish yozuvi | Navbatga yozish |
| Moliyaviy hisobot | Retsept yozish (shablon asosida) | Dastlabki to'lov qabul qilish |
| Sklad monitoring | Sklad (material sarflash) | — |
| Reyting/leaderboard | Shaxsiy statistikam/reytingim | — |
| Sozlamalar (ish jadvali, komissiya) | Ish jadvalim | — |

**Asosiy maxsus komponentlar:**
- `<Odontogram />` — 32 tishni SVG'da chizadi, tish bosilganda modal ochib muolaja/holat tanlanadi, rang holatga qarab o'zgaradi.
- `<ScheduleCalendar />` — kun/hafta ko'rinishida shifokorlar band/bo'sh vaqtlari, drag orqali emas, faqat bo'sh slotga bosib navbat qo'yiladi (xatoni oldini olish uchun).
- `<PatientTimeline />` — bemor kartochkasidagi xronologik tarix (tashrif, muolaja, to'lov, fotosurat birga).
- `<StatsCharts />` — Recharts asosida daromad/bemor dinamikasi.

**Auth oqimi:** login → access+refresh token → access token xotirada (Zustand store, memory-only, XSS xavfini kamaytirish uchun), refresh token httpOnly cookie'da (backend shu tarzda sozlanadi) → Axios interceptor 401 kelganda avtomatik refresh qiladi.

**API layer:** har modul uchun alohida fayl (`api/patients.ts`, `api/appointments.ts`, ...), TanStack Query hooklari (`usePatients()`, `useCreateAppointment()`) orqali chaqiriladi — komponentlar to'g'ridan-to'g'ri axios chaqirmaydi.

---

## 12. Xavfsizlik talablari

- Barcha trafik HTTPS/TLS orqali (Nginx + Let's Encrypt).
- Django: `SECURE_HSTS_SECONDS`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE` yoqilgan.
- Parollar — Django default (`PBKDF2`/`Argon2`) hash.
- 2FA — ixtiyoriy, `django-otp` yoki oddiy SMS/Telegram-kod asosida.
- Rate limiting — login endpointda DRF throttling (`AnonRateThrottle`).
- Audit log — `django-simple-history` orqali kim, qachon, nimani o'zgartirgani (ayniqsa `Treatment`, `Payment`, `Material` uchun muhim).
- Object-level permission — doktor faqat o'z yozuvini/bemorini ko'radi (agar ruxsat berilmagan bo'lsa).
- Muntazam avtomatik backup (9-band Celery task) + backup'ni alohida joyda saqlash.

---

## 13. DevOps va deployment

**Docker Compose xizmatlari:** `backend` (Gunicorn), `celery-worker`, `celery-beat`, `telegram-bot`, `frontend` (Nginx bilan build qilingan static), `postgres`, `redis`, `minio` (ixtiyoriy), `nginx` (reverse proxy).

**CI/CD (GitHub Actions):** har PR'da — lint (`ruff`) → test (`pytest`) → Docker image build → (main branch'ga merge bo'lsa) staging/prod'ga deploy.

**Monitoring:** Sentry (backend + frontend xatoliklar), oddiy uptime monitoring (masalan UptimeRobot), Celery uchun Flower (task monitoring, ixtiyoriy).

---

## 14. Testlash strategiyasi

`pytest-django` + `factory_boy`. Eng muhim test qamrovi kerak bo'lgan joylar (chunki xato bo'lsa real pul/bemor zarari bo'ladi):

1. Double-booking oldini olish (`scheduling`)
2. Komissiya hisoblash formulasi (`payments`)
3. Sklad avtomatik kamayishi va low-stock trigger (`inventory`)
4. Rol asosidagi ruxsatlar (`permissions`) — har rol uchun "ruxsat bor/yo'q" testlari
5. Odontogram tooth_number validatsiyasi (faqat 11–48 FDI raqamlar)

---

## 15. Ishlab chiqish bosqichlari (taklif etilgan roadmap)

| Bosqich | Muddat (taxminiy) | Qamrov |
|---|---|---|
| **Faza 1 — MVP** | 4–5 hafta | accounts+auth, departments, doctors+working-hours, patients, scheduling (double-booking bilan), oddiy treatment yozuvi |
| **Faza 2** | 3–4 hafta | odontogram, prescriptions+shablonlar, inventory+material usage, payments+commission |
| **Faza 3** | 2–3 hafta | ratings/badges, notifications to'liq (Celery+Telegram bot), reports/dashboard |
| **Faza 4** | 2 hafta | Frontend polish, testlar, xavfsizlik hardening, deployment, hujjatlashtirish |

Faza 1 tugagach, real klinikada (yoki test foydalanuvchida) sinab ko'rish tavsiya etiladi — bu keyingi fazalardagi noaniqliklarni erta aniqlashga yordam beradi.

---

*Bu hujjat — client-facing "Mahsulot tavsifi" hujjatidagi barcha funksional talablarni qamrab oladi. Har qanday keyingi o'zgarish (yangi funksiya, biznes-qoida o'zgarishi) shu faylga ham aks ettirilishi kerak, aks holda kod va hujjat orasida farq paydo bo'ladi.*
