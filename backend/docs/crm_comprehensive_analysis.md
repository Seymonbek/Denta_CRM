# DentaCRM Ilovalari Aro Integratsiya va Tizimli Tahlil Rejasi

Ushbu hujjat DentaCRM tizimidagi barcha 15 ta ilova (apps) o'rtasidagi bog'liqliklar, tizimdagi kamchiliklar va ularni bartaraf etish bo'yicha har tomonlama tahlil hamda amalga oshirilishi kerak bo'lgan ishlar rejasini taqdim etadi.

---

## 1. DentaCRM Ilovalari Xaritasi

Tizim quyidagi asosiy modullardan tashkil topgan:
* **Mijozlar va Navbatlar**: `patients`, `scheduling`, `notifications`, `telegram_bot`
* **Klinika va Shifokorlar**: `accounts`, `doctors`, `departments`, `ratings`
* **Klinik Davolash**: `treatments`, `odontogram`, `prescriptions`
* **Moliya va Resurslar**: `payments`, `inventory`, `reports`
* **Yadro**: `core`

---

## 2. Ilovalararo Mavjud Kamchiliklar va Integratsiya Nuqtalari

### A. Davolash (`treatments`) va Ombor zaxiralari (`inventory`)
* **Mavjud holat**: `MaterialUsage` modeli orqali davolashda ishlatilgan materiallar yozib boriladi. `post_save` signali orqali ombordagi zaxira (`Material.quantity_in_stock`) kamaytiriladi.
* **Kamchiliklar**:
  1. **Manfiy zaxira (Negative Stock)**: Shifokor davolash jarayonida omborda bor miqdordan ko'proq material sarflasa, tizim buni tekshirmaydi va ombor zaxirasini manfiy songa tushirib yuboradi.
  2. **Kam zaxira haqida ogohlantirish (Low Stock Alert)**: Material zaxirasi belgilangan minimum chegaradan (`minimum_threshold`) pastga tushib ketganda, Bosh shifokor yoki Admin ogohlantirilmaydi.
* **Yechim integratsiyasi**:
  * `MaterialUsage` yaratilayotganda `quantity_used <= quantity_in_stock` ekanligi tekshirilib, validator o'rnatiladi.
  * Zaxira kamayib minimum chegaraga yetganda, avtomatik ravishda `inventory.low_stock` tipidagi `NotificationLog` yaratiladi.

---

### B. Davolash (`treatments`) va Reyting/Ballar (`ratings`)
* **Mavjud holat**: Shifokorlar har xil yutuqlar (yangi bemor, tugallangan davolash va h.k.) uchun ball yig'ib borishlari uchun `ScoreLog` va `Badge` modellari mavjud. Ammo ballar qo'lda yoki alohida hisoblanadi.
* **Kamchiliklar**: Shifokorlar davolashni muvaffaqiyatli yakunlaganda yoki rasm yuklaganda tizim avtomatik ball bermaydi. Tizim gamifikatsiyasi (rag'batlantirish) to'liq ishlamaydi.
* **Yechim integratsiyasi**:
  * `Treatment.stage` maydoni `completed` (yakunlandi) bo'lganda shifokorga avtomatik **+10 ball** (`ScoreReason.TREATMENT_COMPLETED`) beruvchi signal o'rnatiladi.
  * Agar davolashga rasm (`TreatmentPhoto`) yuklansa, shifokorga avtomatik **+2 ball** (`ScoreReason.PHOTO_UPLOADED`) beriladi.
  * Agar ushbu davolash bemorning birinchi davolashi bo'lsa, **+5 ball** (`ScoreReason.NEW_PATIENT`) qo'shiladi.

---

### C. Davolash (`treatments`) va Retseptlar (`prescriptions`)
* **Mavjud holat**: Shifokorlar davolash yozuviga biriktirilgan holda retsept (`Prescription`) yozishlari mumkin.
* **Kamchiliklar**: Retsept yozilgandan so'ng u qog'oz shaklida qolib ketadi, bemorga bu haqida elektron xabar yoki retsept matni yetib bormaydi.
* **Yechim integratsiyasi**:
  * Retsept yaratilganda, tizim avtomatik ravishda uni bemorning Telegram profiliga yuboradi va `sent_to_telegram_at` vaqtini belgilaydi.
  * Bemor Telegram bot orqali istalgan vaqtda o'zining retseptlari tarixini ko'ra oladi.

---

### D. Navbatlar (`scheduling`) va Bildirishnomalar (`notifications`)
* **Mavjud holat**: Navbatlar yaratiladi va tahrirlanadi, ammo bildirishnomalar tizimi bilan uzviy bog'lanmagan.
* **Kamchiliklar**: Bemor yangi navbat band qilganda, navbat bekor qilinganda yoki vaqti o'zgarganda xabardor qilinmaydi.
* **Yechim integratsiyasi**:
  * Yangi navbat yaratilganda bemorga: `"Sizga [Sana] kuni soat [Vaqt]da shifokor [F.I.Sh.] qabuliga navbat band qilindi"` mazmunidagi Telegram/SMS xabari ketadi.
  * Navbat bekor bo'lganda `appointments.cancelled` bildirishnomasi ishga tushadi.
  * Celery orqali 1 kun oldin (`appointments.reminder_1d`) va 2 soat oldin (`appointments.reminder_2h`) eslatmalar yuborish to'liq avtomatlashtiriladi.

---

### E. Davolash (`treatments`) va Tish Xaritasi (`odontogram`)
* **Mavjud holat**: Har bir davolash yozuvi ostida bemorning tish yozuvlari (`ToothRecord`) shakllantiriladi.
* **Kamchiliklar**: Bemorning avvalgi davolashlardagi tish holatlari keyingi davolashlarda tahlil qilish uchun yagona interfeysga birlashtirilmagan.
* **Yechim integratsiyasi**:
  * Bemor profilida uning barcha davolash yozuvlaridan yig'ilgan yakuniy tish holati xaritasi (Odontogram History) shakllantiriladi.
  * Shifokor yangi davolash boshlaganda bemorning oxirgi faol odontogramma holatini osongina nusxalab olishi (Clone/Import last state) imkoniyati yaratiladi.

---

### F. Telegram Bot (`telegram_bot`) Integratsiyasi
* **Mavjud holat**: Telegram bot uchun alohida ilova mavjud, biroq foydalanuvchilar va bemorlar profili bilan aloqa yetarli emas.
* **Kamchiliklar**: Bemor botdan foydalanishi uchun tizimdagi telefon raqami orqali ro'yxatdan o'tishi (link verification) kerak, ammo bu tizim to'liq integratsiya qilinmagan.
* **Yechim integratsiyasi**:
  * Telegram bot orqali bemor o'z telefon raqamini tasdiqlaydi (`phone_number` orqali `Patient` ga bog'lanadi).
  * Tasdiqlangandan so'ng bot orqali:
    1. Kelgusi qabullar va shifokor ish vaqtini ko'rish.
    2. Yangi qabulga yozilish (bo'sh slotlar asosida).
    3. Shifokor ko'rigidan so'ng shifokorga baho/fikr bildirish (Feedback loop, bu `ratings` tizimi ballarini hisoblashda ishlatiladi).

---

## 3. Loyiha Bo'yicha Integratsiya Yo'l Xaritasi (Roadmap)

| Bosqich | Yo'nalish | Integratsiya Qilinadigan Ilovalar | Kutilayotgan Natija |
| :--- | :--- | :--- | :--- |
| **1-Bosqich** | Ombor va Xavfsizlik | `treatments` ↔ `inventory` | Manfiy zaxira taqiqlanadi, kam zaxira bo'yicha bildirishnomalar ishga tushadi. |
| **2-Bosqich** | Gamifikatsiya va Reyting | `treatments` ↔ `ratings` | Davolash yakunlanganda va rasm yuklanganda shifokorlarga avtomatik ball beriladi. |
| **3-Bosqich** | Eslatmalar va Muloqot | `scheduling` ↔ `notifications` | Navbatlar bo'yicha bemorlarga avtomatik SMS/Telegram xabarlari yuboriladi. |
| **4-Bosqich** | Raqamli Retseptlar | `prescriptions` ↔ `telegram_bot` | Yozilgan retseptlar bemorning Telegram botiga avtomatik yuboriladi. |
| **5-Bosqich** | Tibbiy Tahlil | `treatments` ↔ `odontogram` | Bemorning tish xaritasi tarixi davolash jarayonlariga ko'ra avtomatik yangilanib boradi. |
