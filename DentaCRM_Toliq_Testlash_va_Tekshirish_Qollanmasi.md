# DentaCRM — To'liq Tizimni Bosqichma-bosqich Testlash va Tekshirish Qo'llanmasi

Ushbu qo'llanma **DentaCRM** tizimining barcha funksional imkoniyatlari, rollari va biznes-jarayonlarini boshidan oxirigacha har bir detaligacha tekshirib chiqishingiz uchun maxsus ishlab chiqilgan.

---

## 🔑 Tizimga Kirish Uchun Foydalanuvchilar (Login & Parollar)

Testlash davomida quyidagi 3 xil rolga ega tayyor akkauntlardan foydalaning:

| Rol | Ism-Familiya | Telefon raqam (Login) | Parol | Asosiy Vazifasi |
| :--- | :--- | :--- | :--- | :--- |
| 👑 **Bosh Shifokor** | Rustam Xasanov | `+998901234567` | `admin123` | To'liq klinika boshqaruvi, chegirmalarni tasdiqlash, ombor, hisobotlar, xodimlar |
| 💼 **Administrator** | Nilufar Alimova / Diyor | `+998935551122` | `admin123` | Bemorlarni qabul qilish, navbatlar, kassa to'lovlari, chek chiqarish, smena ochish/yopish |
| 👨‍⚕️ **Shifokor (Doctor)** | Anvar Shokirov | `+998909876543` | `doctor123` | Odontogram (tish xaritasi), tashxis, rasmlar/rentgen, retsept, material sarfi, muolajani yakunlash |

---

## 🚀 1-BOSQICH: Administrator Roli Bo'yicha Testlash

Tizimga **Administrator** (`+998935551122` / `admin123`) sifatida kiring.

### 1.1. Kassa Smenasini Ochish (Cash Shift)
1. Chap menyudan **"Kassa Smenalari"** bo'limiga o'ting (yoki yuqori o'ng burchakdagi Kassa tugmasini bosing).
2. **"Smena Ochish"** tugmasini bosing.
3. Kassadagi boshlang'ich qoldiq naqd pulni kiriting (masalan: `500,000` so'm) va tasdiqlang.
4. **Tekshirish:**
   * Smena holati **"Ochiq"** bo'lib o'zgarganini va joriy administrator nomi to'g'ri chiqqanini tekshiring.

### 1.2. Yangi Bemor Ro'yxatga Olish (Patients)
1. Chap menyudan **"Bemorlar"** bo'limiga o'ting.
2. **"+ Yangi Bemor"** tugmasini bosing.
3. Bemor ma'lumotlarini to'ldiring:
   * Ism, Familiya (masalan: *Jasur Boboyev*)
   * Telefon raqami (`+998901112233`)
   * Tug'ilgan sana, jinsi, manzili
4. **"Saqlash"** tugmasini bosing.
5. **Tekshirish:**
   * Bemorlar ro'yxatida yangi bemor paydo bo'lganini, qidiruv tizimi orqali ism yoki telefon bo'yicha tez topilayotganini tekshiring.

### 1.3. Navbat Yaratish (Appointments Scheduling)
1. Chap menyudan **"Navbatlar"** bo'limiga o'ting.
2. **"+ Yangi Navbat"** tugmasini bosing.
3. Bosqichlarni to'ldiring:
   * **Bemor:** Yangi yaratilgan bemorni tanlang (*Jasur Boboyev*)
   * **Shifokor:** *Dr. Anvar Shokirov*
   * **Bo'lim:** *Terapevtik stomatologiya*
   * **Muolaja turi:** *Tish davolash va plomba*
   * **Sana va Vaqt:** Kalendardan bo'sh vaqt slotini tanlang.
4. **"Rejalashtirish"** tugmasini bosing.
5. **Tekshirish:**
   * Navbatlar jadvalida bemor ismi, shifokor ismi, bo'limi to'liq ko'rinayotganini tekshiring.
   * Holati `Rejalashtirilgan` bo'lib turadi.
   * **"✅ Tasdiqlash"** tugmasini bosib, holatni `Tasdiqlangan` ga o'tkazing.
   * **Muddati o'tganlar tekshiruvi:** Status filtridan `⚠️ Muddati o'tganlar` ni tanlab ko'ring.

---

## 🩺 2-BOSQICH: Shifokor Roli Bo'yicha Testlash (Muolaja Jarayoni)

Tizimdan chiqing (*Logout*) va **Shifokor** (`+998909876543` / `doctor123`) sifatida kiring.

### 2.1. Qabulni Boshlash
1. **"Navbatlar"** bo'limiga o'ting.
2. Tasdiqlangan navbat qarshisidagi **"🦷 Qabulni Olib Borish"** tugmasini bosing (yoki Bemor sahifasidagi **"🔴 Joriy Muolaja"** tabiga kiring).
3. **"Muolaja Sessiyasini Boshlash"** tugmasini bosing.

### 2.2. Odontogram (Interaktiv 32/52 Tish Xaritasi)
1. **"🦷 Odontogram"** tabiga o'ting.
2. Istalgan tishni bosing (masalan: `16-tish` yoki `24-tish`).
3. Tish holatini tanlang (Karies, Plomba, Pulpa, Koronka, Implant va h.k.).
4. Tish yuzalarini (Okluzal, Vestibulyar, Lingval) belgilang.
5. **"Saqlash"** tugmasini bosing.
6. **Tekshirish:** Tish rangining xaritada darhol o'zgarganini va pastki tarixda yozuv paydo bo'lganini tekshiring.

### 2.3. Tashxis, Xulosa va Rasmlar (Rentgen)
1. **"🔴 Joriy Muolaja"** tabiga qayting.
2. **Tashxis (Diagnoz):** `O'tkir o'rta karies (K02.1)` kiriting.
3. **Batafsil xulosa:** Shikoyat va bajarilgan ishlarni yozing va **"Saqlash"** ni bosing.
4. **Rasmlar:**
   * Rasm turini tanlang (`Muolajadan oldin` yoki `Rentgen`).
   * Rasm yuklang va uning galereyada paydo bo'lishini ko'ring.

### 2.4. Retsept Yozish
1. **"Retsept Yozish"** tugmasini bosing.
2. Shablonlardan birini tanlang (masalan: *Og'riqsizlantiruvchi* yoki *Antibiotik*) yoki o'zingiz dori va ichish tartibini yozing.
3. **"Saqlash"** ni bosing.
4. **Tekshirish:** Retsept ro'yxatda sana va vaqti bilan chiroyli chiqadi.

### 2.5. Ishlatilgan Materiallarni Sarflash (Material Usages)
1. **"Ishlatilgan Materiallar"** bo'limiga tushing.
2. Material tanlang (masalan: *Stomatologik Kompozit Plomba (Filtek Z250)*).
3. Miqdorini kiriting (`1` dona yoki `2.5` gram) va **"Qo'shish"** tugmasini bosing.
4. **Tekshirish:**
   * Material darhol ro'yxatga qo'shiladi, nomi, sarflangan miqdori va o'lchov birligi to'liq aks etadi.

### 2.6. Narx Belgilash va Qabulni Yakunlash
1. **Jami Muolaja Narxi:** `350,000` so'm kiriting.
2. **"Qabulni Yakunlash"** tugmasini bosing.
3. Tasdiqlash dialogida **"Ha, Yakunlash"** ni tanlang.
4. **Tekshirish:**
   * Qabul muvaffaqiyatli yakunlanadi, navbat `Yakunlangan` holatiga o'tadi va bemor balansida `350,000` so'm qarzdorlik hosil bo'ladi.

---

## 💰 3-BOSQICH: To'lov Qabul Qilish va Chek Chiqarish (Administrator)

Tizimga qaytadan **Administrator** (`+998935551122` / `admin123`) sifatida kiring.

### 3.1. To'lov Qabul Qilish (Kassa)
1. **"To'lovlar & Komissiya"** bo'limiga o'ting.
2. **"+ Yangi To'lov"** tugmasini bosing.
3. Bemor sifatida *Jasur Boboyev* ni tanlang.
4. To'lov turini tanlang: `Naqd pul`, `Karta (Terminal)` yoki `O'tkazma (Click/Payme)`.
5. Summani kiriting (masalan: to'liq `350,000` so'm yoki qisman `200,000` so'm).
6. **"To'lovni Qabul Qilish"** tugmasini bosing.

### 3.2. Chek Chop Etish (Receipt Print)
1. Amalga oshirilgan to'lov qatoridagi **"🖨️ Chek"** tugmasini bosing.
2. **Tekshirish:**
   * Klinika nomi, chek raqami, sana, bemor ismi, qabul qilgan administrator, to'lov turi va summasi to'liq va formatlangan holda printerga/PDF ga tayyor bo'lib chiqadi.

### 3.3. Xarajat Kiritish (Klinika Xarajatlari)
1. **"To'lovlar & Komissiya"** -> **"Xarajatlar"** tabiga o'ting.
2. **"+ Xarajat Qo'shish"** tugmasini bosing.
3. Kategoriya (masalan: *Kommunal to'lovlar* yoki *Kantselyariya*), summa (`50,000` so'm) va tavsif kiriting.
4. **"Saqlash"** ni bosing.

### 3.4. Kassa Smenasini Yopish (Z-Report)
1. **"Kassa Smenalari"** bo'limiga o'ting.
2. **"Smenani Yopish"** tugmasini bosing.
3. Tizim avtomatik hisoblab bergan jami naqd tushum, karta tushumi va xarajatlarni ko'ring.
4. Tasdiqlang va smenani yoping.

---

## 👑 4-BOSQICH: Bosh Shifokor Nazorati va To'liq Boshqaruv

Tizimga **Bosh Shifokor** (`+998901234567` / `admin123`) sifatida kiring.

### 4.1. Tasdiqlashlar Paneli (Approvals)
1. Chap menyudan **"Tasdiqlashlar"** bo'limiga o'ting.
2. **Chegirmalar tabi:**
   * Agar shifokor bemorga chegirma so'ragan bo'lsa, u shu yerda chiqadi.
   * **`✅ Tasdiqlash`** yoki sabab yozib **`❌ Rad etish`** amallarini tekshiring.
3. **To'lovni Bekor Qilish (Refunds) tabi:**
   * Administrator adashib kiritgan to'lovni bekor qilishni so'raganda, bosh shifokor tasdiqlaydi.

### 4.2. Ombor va Texkartalar (Inventory & BOMs)
1. **"Ombor va Materiallar"** bo'limiga o'ting.
2. Yangi material qo'shish, minimal zaxira miqdori belgilash.
3. Mavjud materialga **"Kirim Qilish (+)"** orqali miqdor qo'shish.
4. **"Texkartalar (BOM)"** tabiga o'ting:
   * Biror muolaja turini tanlang (masalan: *Plomba qo'yish*).
   * Ushbu muolajaga ketadigan standart materiallar va miqdorlarini biriktiring.

### 4.3. Shifokorlar va Xodimlar Boshqaruvi
1. **"Shifokorlar"** bo'limiga o'ting.
2. Yangi shifokor qo'shish, ularning foiz stavkasi (komissiya %) ni o'zgartirish.
3. **"Foydalanuvchilar"** bo'limida yangi xodimlarga rol (Administrator, Shifokor) berish.

### 4.4. Maosh va Ish Haqi (Payroll & Doctors Commissions)
1. **"Maosh va Ish Haqi"** bo'limiga o'ting.
2. Har bir shifokor bo'yicha ko'ring:
   * Jami davolagan bemorlari soni
   * Keltirgan umumiy daromadi
   * Shifokorga hisoblangan foizli ish haqi (Komissiya)
   * Materiallar xarajati chegirilgandan keyingi sof foyda.

### 4.5. AI & Boshqaruv Hisobotlari (Reports & Analytics)
1. **"Hisobotlar"** bo'limiga o'ting.
2. Klinikadagi daromad va xarajatlar dinamikasi grafiklarini, eng ommabop muolajalarni ko'ring.
3. **"AI Tahlil"** tugmasini bosib, klinika faoliyati bo'yicha sun'iy intellekt xulosasini tekshiring.

### 4.6. Audit Log (Xavfsizlik Tarixi)
1. **"Audit Jurnali"** bo'limiga o'ting.
2. Kim, qaysi vaqtda qaysi bemor, to'lov yoki muolajani o'zgartirganini to'liq tekshiring.

---

## 🛡️ 5-BOSQICH: Chekka Holatlar va Xavfsizlikni Sinash (Edge Cases)

| Sinov | Kutilgan Natija |
| :--- | :--- |
| **Double Booking:** Bitta shifokorga ayni bir vaqtga ikkinchi navbat qo'yish | Tizim ruxsat bermaydi va vaqt band ekanini ogohlantiradi. |
| **Ruxsatlar chegarasi:** Administrator muolajani yakunlashga yoki retsept yozishga uringanda | Faqat ko'rish rejimi banneri chiqadi va yakunlash tugmasi bloklanadi. |
| **Kam qoldiq:** Material omborda minimal chegaradan kam qolsa | Tizim sariq ogohlantirish belgisi bilan omborda kam qolganini ko'rsatadi. |
| **Vaqti o'tgan navbat:** Bemor o'z vaqtida kelmasa | `⚠️ Vaqti o'tgan` deb belgilanadi va bir bosishda `Kelmagan (No show)` qilinadi. |

---

✅ *Ushbu qo'llanma bo'yicha barcha bosqichlarni ketma-ketlikda tekshirib chiqsangiz, DentaCRM tizimining barcha mantiqiy jarayonlari 100% to'liq va xatosiz ishlashiga to'liq ishonch hosil qilasiz.*
