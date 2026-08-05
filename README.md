# 🦷 DentaCRM — Stomatologiya Klinikasi Boshqaruv Tizimi (Backend)

![Python Version](https://img.shields.io/badge/Python-3.12%20%7C%203.14-blue.svg)
![Django Version](https://img.shields.io/badge/Django-5.2%20LTS-green.svg)
![DRF Version](https://img.shields.io/badge/DRF-3.15-red.svg)
![Docker Supported](https://img.shields.io/badge/Docker-Ready-blue.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

**DentaCRM Backend** — Stomatologiya va tish klinikalarini 360-darajada avtomatlashtirish, bemorlar kartotekasidan tortib interaktiv tish formulasi (odontogramma), moliyaviy hisob-kitoblar, shifokorlar komissiyasi hamda ombor nazoratigacha bo'lgan barcha jarayonlarni qamrab oluvchi zamonaviy, xavfsiz va yuqori unumdorlikka ega **Django 5 + REST Framework** backend servisidir.

---

## 📌 Asosiy Imkoniyatlar va Modullar (`apps/`)

Loyiha **Domain-Driven Design (DDD)** arxitektura prinsiplari asosida 15 alohida modulga bo'lingan:

* 🔐 **`accounts` (Foydalanuvchilar & Xavfsizlik)**:
  * Telefon raqam orqali autentifikatsiya (`USERNAME_FIELD`).
  * 3 ta rol: `bosh_shifokor`, `doctor`, `administrator`.
  * SimpleJWT, 2FA (Ikki bosqichli autentifikatsiya) va OTP tasdiqlash.
* 🏗 **`core` (Tizim Tayanchi)**:
  * Tayanch modellar (`BaseModel` UUID bilan, `SoftDeleteModel`, `AuditableModel`).
  * RBAC ruxsatnomalari, Throttling (Rate limiting), Idempotentlik va xavfsizlik middleware-lari.
  * Healthcheck ko'rsatkichlari (`/healthz/` va `/readyz/`).
* 🏢 **`departments` (Bo'limlar va Xonalar)**:
  * Klinika bo'limlari, xonalar va davolash kreslolarini taqsimlash.
* 🩺 **`doctors` (Shifokorlar Profili)**:
  * Shifokorlar jadvallari (Working Hours), mutaxassisligi va xizmat turlari hamda komissiya stavkalari.
* 📋 **`patients` (Bemorlar Kartotekasi)**:
  * Bemorlar reyestri, kasallik tarixi, allergiyalar, biriktirilgan rentgen rasmlari va hujjatlar saqlash.
* 📅 **`scheduling` (Qabul va Jadvallar)**:
  * Qabulga yozilish (Appointments), vaqt slotlari to'qnashuvini tekshirish (conflict check).
  * Statuslar zanjiri (`scheduled`, `confirmed`, `in_progress`, `completed`, `cancelled`, `no_show`).
* 🦷 **`odontogram` (Interaktiv Tish Formulasi)**:
  * FDI xalqaro standarti (Katta yoshdagilar: 11-48, Bolalar: 51-85).
  * Har bir tish va uning 5 ta yuzasi (mesial, distal, occlusal, buccal, lingual) bo'yicha holatlarni kuzatish (karies, plomba, koronka, ildiz kanali va h.k.).
* 🛠 **`treatments` (Davolash va Muolajalar)**:
  * Davolash planlari (`TreatmentPlan`), bosqichlari va bajarilgan muolajalar narxini avtomatik hisoblash.
* 💊 **`prescriptions` (Retseptlar)**:
  * Retsept shablonlari, dori-darmonlar dozasi yo'riqnomasi va tayyor PDF retsept shakllantirish.
* 💳 **`payments` (Moliya va Komissiyalar)**:
  * Bemorlar balansi va to'lovlar (Naqd, karta, terminal, onlayn).
  * Shifokorlar komissiyalarini avtomatik hisoblash va maoshlar nazorati.
* 📦 **`inventory` (Ombor va Sarf-xarajatlar)**:
  * Stomatologik materiallar ombori, muolajalar davomida ishlatilgan materiallarni avtomatik hisobdan chiqarish (`MaterialUsage`).
* 🔔 **`notifications` (Bildirishnomalar)**:
  * SMS, Telegram va Push bildirishnomalar navbati (`Celery` va `Redis` orqali asinxron).
* ⭐ **`ratings` (Reyting va Baholash)**:
  * Shifokorlar reytingi, nishonlar (`badges`) va yetakchilar jadvali (`leaderboard`).
* 📊 **`reports` (Analitika va Hisobotlar)**:
  * Oylik/kunlik tushumlar, shifokorlar unumdorligi, ko'p so'ralgan muolajalar va operatsion ko'rsatkichlar.
* 🤖 **`telegram_bot` (Telegram Bot Integration)**:
  * `Aiogram 3` orqali bemorlarni qabulga yozish va shifokorlarga bildirishnomalar yuborish.

---

## 🛠 Texnologik Stek

* **Language**: Python 3.12 / 3.14
* **Framework**: Django 5.2 LTS, Django REST Framework 3.15
* **Database**: PostgreSQL 16 (dev rejimida SQLite fallback)
* **Async & Cache**: Redis 7, Celery 5.4, Celery Beat, Celery Results
* **Storage**: AWS S3 / MinIO (`django-storages`, `boto3`)
* **Telegram**: Aiogram 3.13
* **API Documentation**: OpenAPI 3.0, Swagger UI, ReDoc (`drf-spectacular`)
* **Admin Interface**: Django Unfold 0.33
* **Testing & Quality**: Pytest, Coverage, Ruff, MyPy

---

## 🚀 Ishga Tushirish Yo'riqnomasi

### 1-USUL: Docker Compose Bilan (Tavsiya Etiladi ⭐️)

Kompyuteringizda **Docker Desktop** yoqilgan holda loyiha ildizida:

```bash
docker compose up --build -d
```

Ushbu buyruq quyidagi 6 ta servisni avtomatik ravishda birgalikda yurgazadi:
1. **`db`** — PostgreSQL 16 ma'lumotlar bazasi (`:5432`)
2. **`redis`** — Redis 7 keshlash va broker (`:6379`)
3. **`minio`** — S3 MinIO fayllar ombori (`:9000` / Console `:9001`)
4. **`web`** — Django REST API Backend (`:8000`)
5. **`celery_worker`** — Asinxron topshiriqlar ishchisi
6. **`celery_beat`** — Rejali vazifalar taymeri (Cron)

---

### 2-USUL: Lokal Ishga Tushirish (Docker'siz)

1. **Virtual muhit yaratish va faollashtirish**:
   ```powershell
   py -m venv venv
   .\venv\Scripts\Activate
   ```

2. **Kutubxonalarni o'rnatish**:
   ```bash
   pip install -r requirements/dev.txt
   ```

3. **Muhit (.env) faylini tayyorlash**:
   ```powershell
   copy .env.example .env
   ```

4. **Migratsiya va Superuser yaratish**:
   ```bash
   python manage.py migrate
   python manage.py createsuperuser
   python manage.py seed_demo_data
   ```

5. **Serverni yurgazish**:
   ```bash
   python manage.py runserver
   ```

---

## 🌐 API Hujjatlari va Manzillar

Server yoqilgach, brauzerda quyidagi manzillarga kirishingiz mumkin:

* 📜 **Swagger UI (API Docs)**: [http://localhost:8000/api/docs/](http://localhost:8000/api/docs/)
* 📕 **ReDoc**: [http://localhost:8000/api/redoc/](http://localhost:8000/api/redoc/)
* 📐 **OpenAPI Schema**: [http://localhost:8000/api/schema/](http://localhost:8000/api/schema/)
* 🛠 **Admin Panel**: [http://localhost:8000/admin/](http://localhost:8000/admin/)
* 💚 **Health Check**: [http://localhost:8000/healthz/](http://localhost:8000/healthz/)
* 🗄 **MinIO Console**: [http://localhost:9001/](http://localhost:9001/) *(Login: `minioadmin` / Parol: `minioadmin`)*

---

## 🧪 Testlash va Kod Sifatini Tekshirish

```bash
# Avtomatik testlarni yurgazish
pytest -q

# Kod stili va tiplarni tekshirish (Linter & Typing)
ruff check .
ruff format --check .
mypy .
```

---

## 📂 Loyiha Strukturasi

```
backend/
├── apps/                    # Biznes modullari (DDD arxitekturasi)
│   ├── accounts/            # Foydalanuvchilar va 2FA
│   ├── core/                # BaseModel, RBAC, middleware, health
│   ├── departments/         # Bo'lim va kreslo boshqaruvi
│   ├── doctors/             # Shifokorlar va ish jadvallari
│   ├── inventory/           # Ombor va materiallar sarfi
│   ├── notifications/       # SMS/Telegram/Push bildirishnomalari
│   ├── odontogram/          # FDI tish formulasi
│   ├── patients/            # Bemorlar va tibbiy karta
│   ├── payments/            # Moliya, billing, shifokor komissiyalari
│   ├── prescriptions/       # Retseptlar va PDF shakllantirish
│   ├── ratings/             # Reytinglar va yetakchilar jadvali
│   ├── reports/             # Tahliliy hisobotlar
│   ├── scheduling/          # Qabulga yozilish va kalendar
│   ├── telegram_bot/        # Aiogram 3 Telegram bot
│   └── treatments/          # Davolash plani va muolajalar
├── config/                  # Loyiha konfiguratsiyasi (settings, urls, celery)
├── docs/                    # Loyiha arxitektura va tahlil hujjatlari
├── requirements/            # Kutubxonalar (base.txt, dev.txt, prod.txt)
├── templates/               # Custom admin/unfold shablonlari
├── tests/                   # Keng ko'lamli unit va integratsion testlar
├── Dockerfile               # Production & Dev Docker imiji
├── docker-compose.yml       # 6 ta servisni orchestratsiya qilish
├── manage.py                # Django buyruqlar nuqtasi
├── pyproject.toml           # Ruff va MyPy sozlamalari
└── pytest.ini               # Pytest konfiguratsiyasi
```

---

## 📝 Litsenziya

Ushbu loyiha **MIT License** ostida tarqatiladi.

---
*Yaratuvchi: **Seymonbek** ([GitHub Repository](https://github.com/Seymonbek/Denta_CRM))*
