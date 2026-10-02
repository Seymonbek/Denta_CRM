# 🚀 DentaCRM — AWS EC2 Serverga O'rnatish Qo'llanmasi (Termius Orqali)

Ushbu qo'llanma orqali siz **AWS EC2 (Ubuntu)** serveringizga DentaCRM tizimini to'liq (Frontend + Backend + PostgreSQL + Redis + Celery + Nginx) bir necha daqiqada o'rnatasiz.

---

## ⚠️ 1-QADAM: AWS Konsolida Portlarni Ochish (Security Group)

Termiusda o'rnatishdan oldin, brauzer orqali saytingiz ochilishi uchun AWS konsolida **80-port (HTTP)** ochiq bo'lishi shart!

1. **AWS Console** ➔ **EC2** ➔ **Instances** bo'limiga kiring.
2. Serveringizni tanlang va pastdagi **Security** yorlig'iga o'ting.
3. **Security Groups** havolasini bosing.
4. **Edit inbound rules** tugmasini bosing va quyidagi qoidalarni qo'shing:

| Type | Protocol | Port Range | Source | Izoh |
| :--- | :--- | :--- | :--- | :--- |
| **SSH** | TCP | 22 | Anywhere (yoki IP'ingiz) | Termius ulanishi uchun |
| **HTTP** | TCP | 80 | `0.0.0.0/0` (Anywhere-IPv4) | Veb-sayt ochilishi uchun |
| **HTTPS** | TCP | 443 | `0.0.0.0/0` (Anywhere-IPv4) | SSL sertifikat uchun |

**Save rules** tugmasini bosing.

---

## 💻 2-QADAM: Termius Orqali Serverga O'rnatish

Termius terminalida serveringizga ulanganingizdan so'ng, quyidagi buyruqlarni ketma-ket bajaring:

### 1. Loyihani GitHub'dan yuklab olish (Clone)
```bash
git clone https://github.com/Seymonbek/Denta_CRM.git
cd Denta_CRM
```

---

### 2. O'rnatish skriptiga ruxsat berish va ishga tushirish
Skript avtomatik ravishda Docker, Nginx, Node.js o'rnatadi, 2GB Swap xotira yoqadi, PostgreSQL va Redis konteynerlarini ko'taradi, migratsiyalarni yurgazadi va Frontendni build qiladi:

```bash
chmod +x deploy.sh
./deploy.sh
```

*(O'rnatish 3-5 daqiqa davom etadi. Oxirida sizga serveringizning Public IP manzili ko'rsatiladi)*

---

### 3. Bosh Administrator (Superuser) hisobini yaratish
O'rnatish tugagach, tizimga kirish uchun administrator yarating:

```bash
sudo docker compose -f backend/docker-compose.prod.yml exec web python manage.py createsuperuser
```
Terminal sizdan quyidagilarni so'raydi:
- **Phone number / Username:** Telefon raqamingiz (masalan: `+998901234567`)
- **First name / Last name:** Ismingiz va familiyangiz
- **Password:** Parol (yozayotganda ekranda ko'rinmaydi, terib Enter bosing)

---

## 🌐 3-QADAM: Tizimga Kirish

Brauzeringizni oching va AWS serveringizning **Public IP** manzilini kiriting:

* 🖥 **Asosiy CRM tizimi (Frontend):** `http://<SERVER_IP>`
* 🔐 **Django Boshqaruv Paneli:** `http://<SERVER_IP>/admin/`
* 📚 **API Swagger Hujjatlari:** `http://<SERVER_IP>/api/docs/`

---

## 🛠 Kundalik Kerak Bo'ladigan Foydali Buyruqlar (Cheat Sheet)

### Konteynerlar holatini tekshirish:
```bash
sudo docker compose -f backend/docker-compose.prod.yml ps
```

### Backend xatolarini (loglarni) jonli ko'rish:
```bash
sudo docker compose -f backend/docker-compose.prod.yml logs -f web
```

### Celery xabarnomalar logini ko'rish:
```bash
sudo docker compose -f backend/docker-compose.prod.yml logs -f celery_worker
```

### Konteynerlarni qayta ishga tushirish (Restart):
```bash
sudo docker compose -f backend/docker-compose.prod.yml restart
```

### Nginx veb-serverini qayta ishga tushirish:
```bash
sudo systemctl restart nginx
```

---

## 🔄 Kelgusida Yangi Kodlarni Yangilash (Update)

Agar loyihangizga GitHub orqali yangi o'zgarishlar kiritilsa, serverda yangilash juda oson:

```bash
cd ~/Denta_CRM
git pull origin main
./deploy.sh
```

---

## 🔒 Bepul SSL (HTTPS) Sertifikatini Ulash (Ixtiyoriy)

Agar o'zingizning domeningiz bo'lsa (masalan: `crm.klinika.uz`):

1. Domeningiz A-yozuvini (DNS A record) AWS Public IP'ingizga yo'naltiring.
2. Termiusda Certbot o'rnating:
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d domeningiz.uz
   ```
Certbot avtomatik tarzda SSL o'rnatadi va HTTPS'ga yo'naltiradi!
