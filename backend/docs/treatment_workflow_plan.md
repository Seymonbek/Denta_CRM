# Shifokor va Bemor Biriktirish, Davolash va To'lovlar Integratsiyasi Rejasi

Ushbu reja shifokorlarning ish soatlari, navbatlar (appointments), davolash yozuvlari (treatments) va to'lovlar (payments) o'rtasidagi biznes mantiqini (business workflow) to'liq va uzviy bog'lash uchun ishlab chiqildi.

## 1. Mavjud Muammolar va Kamchiliklar

1. **Ish soatlari tekshirilmasligi**: Yangi navbat (Appointment) yaratilayotganda shifokorning haftalik ish soatlariga (`WorkingHours`) mos kelishi tekshirilmaydi. Navbat ixtiyoriy vaqtga qo'yib yuborilishi mumkin.
2. **Shaxsiy ma'lumotlar xavfsizligi (Privacy / Isolation)**: Tizimga shifokor roli bilan kirgan foydalanuvchilar boshqa shifokorlarning ish soatlarini, dam olish kunlarini, navbatlarini va davolash yozuvlarini ko'ra oladilar va o'zgartira oladilar.
3. **Narx o'zgarganda to'lov holati yangilanmasligi**: Davolash yozuvi (`Treatment`) narxi (`price`) o'zgarganda, uning to'lov holati (`payment_status`) va komissiya yozuvi (`CommissionRecord`) avtomatik ravishda qayta hisoblanmaydi.
4. **To'lovlarni qulay qabul qilish**: Davolash sahifasining o'zidan to'lovlarni qabul qilish va komissiya yozuvlarini ko'rish imkoniyati yo'q.

---

## 2. Taklif Qilinayotgan Mukammal Yechimlar

### A. Ish vaqtini tekshirish (Appointment validation)
* `scheduling/services.py` da navbat yaratilayotganda (`create_appointment`) va tahrirlanayotganda (`update_appointment`) shifokorning ish soatlarini tekshiruvchi maxsus `_check_doctor_working_hours` funksiyasi qo'shiladi:
  * Navbat vaqti shifokorning o'sha kungi haftalik ish soatlari (`WorkingHours`) oralig'iga to'liq tushishi shart.
  * Agar mos ish soati topilmasa, foydalanuvchiga xatolik ko'rsatiladi.

### B. Shifokorlar uchun ma'lumotlarni cheklash (Role-Based Access Control)
* Admin paneldagi shifokor profillari, ish soatlari, dam olish kunlari, navbatlar va davolashlar modellarida shifokorlar uchun cheklov o'rnatiladi:
  * Cheklovlar faqat oddiy shifokorlar (`doctor` roli) uchun amal qiladi.
  * **Bosh shifokor** (`bosh_shifokor` roli), **Administrator** (`administrator` roli) va **Superuser**lar har qanday cheklovlardan ozod qilinadi va butun klinika ma'lumotlarini ko'ra olishadi.
  * Agar oddiy shifokorda `can_view_other_doctors=False` bo'lsa, u faqat o'ziga tegishli yozuvlarni ko'radi va tahrirlay oladi.
  * Navbat yoki davolash yaratishda shifokor maydoni avtomatik ravishda tizimga kirgan shifokorga biriktiriladi va o'zgartirib bo'lmaydigan (`readonly`) qilinadi.

### C. Narx o'zgarganda to'lov holatini qayta hisoblash (Auto-Sync)
* `payments/signals.py` da `Treatment` modeli uchun `post_save` signali yoziladi.
* Agar shifokor davolash narxini o'zgartirsa yoki yangi davolash yozsa, ushbu signal `_refresh_payment_status` funksiyasini chaqiradi. Bu esa:
  * To'lovlar summasini tekshirib, `payment_status` ni (`unpaid`, `partial`, `paid`) yangilaydi.
  * Agar to'liq to'langan bo'lsa, shifokorning komissiya yozuvini (`CommissionRecord`) avtomatik yaratadi yoki yangilaydi.

### D. UX/UI Qulayliklar (Inlines)
* `TreatmentAdmin` sahifasiga `PaymentInline` va `CommissionRecordInline` qo'shiladi:
  * Admin / qabulxona xodimi davolash sahifasidan chiqmagan holda to'lovlarni kiritishi va qabul qilishi mumkin bo'ladi.
  * To'liq to'lov amalga oshirilgandan so'ng, shifokorga hisoblangan komissiya summasi ham o'sha sahifaning o'zida ko'rinadi.

---

## 3. Amalga Oshirish Bosqichlari

### 1-Bosqich: `scheduling/services.py` da Ish vaqtini tekshirish logikasini yozish
* `_check_doctor_working_hours` funksiyasini yozish.
* Navbat vaqti ish soatlariga mos kelishini tekshirishni integratsiya qilish.

### 2-Bosqich: `payments/signals.py` ga Treatment signalini ulash
* `Treatment` obyekti o'zgarganda to'lov holati va komissiyani avtomatik hisoblashni yo'lga qo'yish.

### 3-Bosqich: Shifokorlar uchun Admin paneldagi cheklovlarni joriy etish
* `doctors/admin.py`, `scheduling/admin.py`, va `treatments/admin.py` da querysetlarni va readonly maydonlarni shifokorlar roli uchun cheklash.

### 4-Bosqich: To'lovlar va Komissiya Inline-larini qo'shish
* `TreatmentAdmin` sahifasini mukammallashtirish.

### 5-Bosqich: Testlarni ishga tushirib tekshirish
* Barcha yozilgan kodlar to'g'ri ishlashini Django testlari orqali tekshirish.
