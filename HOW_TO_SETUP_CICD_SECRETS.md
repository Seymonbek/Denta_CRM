# ⚡ GitHub Actions CI/CD Avtomatlashtirishni Yoqish Qo'llanmasi

Ushbu sozlamani bir marta qilib qo'ysangiz, keyinchalik kodingizni GitHub'ga `git push` qilishingiz bilan:
1. GitHub avtomatik testlarni yurgazadi.
2. Agar testlar muvaffaqiyatli o'tsa, **AWS EC2 serveringizga o'zi ulanib, loyihani avtomatik yangilaydi (Auto-deploy)!**

---

## 🔑 GitHub'ga Maxfiy Kalitlarni (Secrets) Kiritish

1. Brauzerda GitHub omboringizga kiring:  
   👉 [https://github.com/Seymonbek/Denta_CRM/settings/secrets/actions](https://github.com/Seymonbek/Denta_CRM/settings/secrets/actions)  
   *(Yoki: **Settings** ➔ Chap menyuda **Secrets and variables** ➔ **Actions**)*

2. Yashil **New repository secret** tugmasini bosing va quyidagi **3 ta parametrni** bittalab qo'shing:

---

### 1-Secret: `AWS_HOST`
* **Name:** `AWS_HOST`
* **Secret:** Serveringizning **Public IPv4** manzili (AWS EC2 konsolida ko'rsatilgan, masalan: `13.51.120.45` yoki shunga o'xshash).
* **Add secret** tugmasini bosing.

---

### 2-Secret: `AWS_USERNAME`
* **Name:** `AWS_USERNAME`
* **Secret:** `ubuntu`
* **Add secret** tugmasini bosing.

---

### 3-Secret: `AWS_SSH_KEY`
* **Name:** `AWS_SSH_KEY`
* **Secret:** AWS server ochganingizda yuklab olgan `.pem` (yoki `.cer`) maxfiy kalitingizning ichidagi to'liq matni.  
  *(Faylni bloknotda ochib, boshidagi `-----BEGIN RSA PRIVATE KEY-----` dan tortib, oxiridagi `-----END RSA PRIVATE KEY-----` gacha barcha qatorlarini to'liq nusxalab tashlaysiz)*.
* **Add secret** tugmasini bosing.

---

## 🎯 Bu Qanday Ishlaydi?

Endi siz kompyuteringizda kod yozib:
```bash
git add .
git commit -m "yangi funksiya qo'shildi"
git push origin main
```
buyrug'ini berishingiz bilan:
- GitHub Actions ishga tushadi (GitHub omboringizdagi **Actions** bo'limida jarayonni jonli kuzatishingiz mumkin).
- Kod testdan o'tadi va to'g'ridan-to'g'ri AWS serveringizdagi saytni yangilab qo'yadi!
- Termiusga kirib, qo'lda hech narsa yozishingiz shart bo'lmaydi!
