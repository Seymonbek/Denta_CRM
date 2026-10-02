#!/usr/bin/env bash
# =============================================================================
# DentaCRM — AWS EC2 (Ubuntu) Avtomatlashtirilgan Deploy Skripti
# =============================================================================
set -e

echo "🚀 [1/8] Tizim paketlarini yangilash va kerakli utilitalarni o'rnatish..."
sudo apt-get update -y
sudo apt-get install -y curl wget git ufw nginx

# -----------------------------------------------------------------------------
# SWAP yaratish (Kamida 2GB swap — AWS t2/t3 micro/small OOM oldini olish uchun)
# -----------------------------------------------------------------------------
if [ ! -f /swapfile ]; then
    echo "💾 [2/8] 2GB Swap xotira yaratilmoqda..."
    sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "✅ Swap muvaffaqiyatli yoqildi."
else
    echo "✅ Swap allaqachon mavjud."
fi

# -----------------------------------------------------------------------------
# Docker & Docker Compose o'rnatish
# -----------------------------------------------------------------------------
if ! command -v docker &> /dev/null; then
    echo "🐳 [3/8] Docker va Docker Compose o'rnatilmoqda..."
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo usermod -aG docker $USER
    echo "✅ Docker o'rnatildi."
else
    echo "✅ Docker allaqachon o'rnatilgan."
fi

# -----------------------------------------------------------------------------
# Node.js 20.x o'rnatish (Frontend build qilish uchun)
# -----------------------------------------------------------------------------
if ! command -v node &> /dev/null; then
    echo "📦 [4/8] Node.js 20.x o'rnatilmoqda..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo "✅ Node.js $(node -v) va npm $(npm -v) o'rnatildi."
else
    echo "✅ Node.js $(node -v) allaqachon mavjud."
fi

# -----------------------------------------------------------------------------
# Backend .env faylini shakllantirish
# -----------------------------------------------------------------------------
echo "⚙️ [5/8] Backend konfiguratsiyasini (.env) tekshirish..."
BACKEND_DIR="$(pwd)/backend"
if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo "Yangi xavfsiz kalitlar yaratilmoqda..."
    SECRET_KEY=$(openssl rand -hex 32)
    DB_PASSWORD=$(openssl rand -hex 16)
    
    cat <<EOF > "$BACKEND_DIR/.env"
DJANGO_SETTINGS_MODULE=config.settings.prod
DJANGO_SECRET_KEY=${SECRET_KEY}
DJANGO_ALLOWED_HOSTS=*
DJANGO_SECURE_SSL_REDIRECT=False
POSTGRES_DB=dentacrm
POSTGRES_USER=dentacrm
POSTGRES_PASSWORD=${DB_PASSWORD}
WEB_CONCURRENCY=2
EOF
    echo "✅ backend/.env muvaffaqiyatli yaratildi."
else
    echo "✅ backend/.env mavjud."
fi

# -----------------------------------------------------------------------------
# Backend konteynerlarini ishga tushirish (PostgreSQL, Redis, Gunicorn, Celery)
# -----------------------------------------------------------------------------
echo "🚀 [6/8] Backend konteynerlarini qurish va ishga tushirish..."
cd "$BACKEND_DIR"
sudo docker compose -f docker-compose.prod.yml up -d --build

echo "⏳ PostgreSQL va Backend to'liq tayyor bo'lishini kutamiz (15 soniya)..."
sleep 15

echo "🛠 Migratsiyalarni amalga oshirish..."
sudo docker compose -f docker-compose.prod.yml exec -T web python manage.py migrate --noinput

echo "🦷 ICD-10 stomatologiya tashxislari bazasini yuklash..."
sudo docker compose -f docker-compose.prod.yml exec -T web python manage.py seed_icd10 || true

echo "📁 Statik fayllarni yig'ish (collectstatic)..."
sudo docker compose -f docker-compose.prod.yml exec -T web python manage.py collectstatic --noinput

cd ..

# -----------------------------------------------------------------------------
# Frontendni yig'ish (React + Vite Build)
# -----------------------------------------------------------------------------
echo "🎨 [7/8] Frontend kutubxonalarini o'rnatish va build qilish..."
cd frontend
# Nisbiy API URL — Nginx orqali barcha so'rovlar /api/ ga yo'naltiriladi
cat <<EOF > .env
VITE_API_BASE_URL=/api/v1/
EOF

npm install --legacy-peer-deps
npm run build
cd ..

# -----------------------------------------------------------------------------
# Nginx sozlamalari
# -----------------------------------------------------------------------------
echo "🌐 [8/8] Nginx veb-serverini sozlash..."
CURRENT_DIR=$(pwd)
sed -e "s|/home/ubuntu/Denta_CRM|$CURRENT_DIR|g" nginx/dentacrm.conf | sudo tee /etc/nginx/sites-available/dentacrm > /dev/null

sudo ln -sf /etc/nginx/sites-available/dentacrm /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl restart nginx

# -----------------------------------------------------------------------------
# Natija
# -----------------------------------------------------------------------------
PUBLIC_IP=$(curl -s ifconfig.me || echo "SERVER_IP")
echo ""
echo "=========================================================================="
echo "🎉 TABRIKLAYMIZ! DentaCRM AWS serveringizda muvaffaqiyatli ishga tushdi!"
echo "=========================================================================="
echo "🌐 Sayt manzili (Frontend): http://$PUBLIC_IP"
echo "🔐 Admin paneli:            http://$PUBLIC_IP/admin/"
echo "📚 API Hujjatlari (Docs):   http://$PUBLIC_IP/api/docs/"
echo ""
echo "👉 Bosh administrator (Superuser) yaratish uchun quyidagi buyruqni bering:"
echo "   sudo docker compose -f backend/docker-compose.prod.yml exec web python manage.py createsuperuser"
echo "=========================================================================="
