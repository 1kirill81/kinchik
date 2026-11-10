# Руководство по развертыванию KinoStream на сервере (VPS)

В этом руководстве подробно описано, как развернуть проект **KinoStream** на удаленном VPS сервере с Ubuntu, настроить автодеплой через **GitHub Actions** и выпустить бесплатный SSL-сертификат (HTTPS).

---

## 📋 Требования к серверу (VPS)

- **ОС:** Ubuntu 22.04 LTS / 24.04 LTS (или Debian 11/12)
- **Конфигурация:**
  - Минимум: 1 vCPU, 2 GB RAM, 20 GB SSD
  - Рекомендуется: 2 vCPU, 4 GB RAM, 40+ GB SSD (для быстрой буферизации торрентов TorrServer и сборки Docker)
- **Открытые порты в фаерволе (UFW / Security Groups):**
  - `22` (SSH)
  - `80` (HTTP для Certbot и Nginx)
  - `443` (HTTPS)
  - `8090` (TorrServer — для стриминга видеопотока)

---

## 🛠️ Шаг 1. Первоначальная настройка VPS

Подключитесь к вашему серверу по SSH:
```bash
ssh root@IP_ВАШЕГО_СЕРВЕРА
```

Обновите пакеты системы:
```bash
apt update && apt upgrade -y
```

Установите Docker и Docker Compose (официальный скрипт установки Docker):
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
```

Проверьте установку:
```bash
docker --version
docker compose version
```

---

## 📂 Шаг 2. Клонирование репозитория на сервере

Создайте директорию для проекта (по умолчанию `/opt/kino2`):
```bash
mkdir -p /opt/kino2
cd /opt/kino2
```

Клонируйте ваш репозиторий с GitHub:
```bash
git clone https://github.com/ВАШ_АККАУНТ/ВАШ_РЕПОЗИТОРИЙ.git .
```
*(Точка в конце означает клонировать файлы прямо в текущую папку `/opt/kino2`)*

---

## ⚙️ Шаг 3. Настройка переменных окружения (.env)

Скопируйте пример файла конфигурации:
```bash
cp .env.example .env
```

Отредактируйте `.env`:
```bash
nano .env
```

Заполните переменные:
- `TMDB_API_KEY`: Ваш API ключ с [themoviedb.org](https://www.themoviedb.org/settings/api).
- `JACKETT_API_KEY`: Оставьте пока пустым, скопируете из веб-интерфейса Jackett после запуска.
- `JWT_SECRET`: Любая случайная длинная строка (например: `openssl rand -hex 32`).
- `NEXT_PUBLIC_TORRSERVER_URL`: 
  - Если без домена: `http://IP_ВАШЕГО_СЕРВЕРА:8090`
  - Если с доменом: `https://torrserver.yourdomain.com` (или `http://IP_ВАШЕГО_СЕРВЕРА:8090`)

Сохраните файл (`Ctrl + O`, `Enter`, затем выход `Ctrl + X`).

---

## 🚀 Шаг 4. Первый запуск проекта

Запустите контейнеры в фоновом режиме:
```bash
docker compose up -d --build
```

Проверьте статус запущенных контейнеров:
```bash
docker compose ps
```
Должны быть запущены три контейнера:
1. `kino2_web` (порт 3000)
2. `kino2_torrserver` (порт 8090)
3. `kino2_jackett` (порт 9117)

### Настройка Jackett:
1. Перейдите в браузере: `http://IP_ВАШЕГО_СЕРВЕРА:9117`
2. В правом верхнем углу скопируйте **API Key**.
3. Добавьте трекеры (кнопка `+ Add indexer`): например, **RuTracker**, **NNM-Club**, **Rutor**, **Kinozal**, **LostFilm**.
4. Вставьте скопированный API Key в `.env` на сервере:
   ```bash
   nano .env
   # JACKETT_API_KEY=ваш_ключ
   ```
5. Перезапустите веб-приложение:
   ```bash
   docker compose restart web
   ```

---

## 🔒 Шаг 5. Настройка Nginx и бесплатного SSL (HTTPS)

Чтобы сайт открывался по красивому домену с замочком HTTPS (`https://kino.yourdomain.com`):

1. **Направьте ваш домен** (DNS A-запись) на IP-адрес вашего VPS сервера.
2. Установите Nginx и Certbot на сервере:
   ```bash
   apt install -y nginx certbot python3-certbot-nginx
   ```
3. Создайте конфигурацию Nginx:
   ```bash
   nano /etc/nginx/sites-available/kinostream.conf
   ```
4. Вставьте конфигурацию (замените `kino.yourdomain.com` на ваш домен):
   ```nginx
   server {
       server_name kino.yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
           
           # Для бесперебойной видеотрансляции и стриминга
           proxy_buffering off;
           proxy_read_timeout 86400s;
           proxy_send_timeout 86400s;
       }
   }
   ```
5. Активируйте сайт и проверьте Nginx:
   ```bash
   ln -s /etc/nginx/sites-available/kinostream.conf /etc/nginx/sites-enabled/
   nginx -t
   systemctl reload nginx
   ```
6. Выпустите бесплатный сертификат Let's Encrypt:
   ```bash
   certbot --nginx -d kino.yourdomain.com
   ```
   *(Certbot автоматически настроит перенаправление с HTTP на HTTPS и автопродление сертификата).*

---

## 🤖 Шаг 6. Настройка CI/CD автодеплоя через GitHub Actions

Файл воркфлоу уже готов и лежит в репозитории: `.github/workflows/deploy.yml`.

Каждый раз, когда вы делаете `git push` в ветку `main` или `master`, GitHub Actions автоматически:
1. Проверяет проект (`TypeScript Type Check`).
2. Проверяет сборку (`npm run build`).
3. Подключается по SSH к вашему VPS.
4. Выполняет `git pull origin main`.
5. Пересобирает и перезапускает Docker-контейнеры без простоя базы данных.
6. Очищает старые неиспользуемые Docker-образы.

### Что нужно настроить в GitHub Secrets:
В вашем репозитории на GitHub перейдите в:  
**Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**.

Добавьте следующие секреты:
| Название секрета | Значение |
|---|---|
| `SERVER_HOST` | Публичный IP адрес вашего VPS сервера |
| `SERVER_USER` | Пользователь на сервере (обычно `root`) |
| `SERVER_SSH_KEY` | Приватный SSH ключ для доступа к серверу |
| `SERVER_PORT` | Порт SSH (по умолчанию `22`, можно не указывать) |
| `TMDB_API_KEY` | Ваш TMDB API ключ (для этапа проверки сборки) |
| `JWT_SECRET` | Ваш секрет для токенов (для этапа проверки сборки) |

### Как сгенерировать SSH ключ для GitHub Actions:
На вашем локальном компьютере (или прямо на сервере):
```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f deploy_key
```
1. Скопируйте публичный ключ `deploy_key.pub` на сервере в файл `~/.ssh/authorized_keys`:
   ```bash
   cat deploy_key.pub >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```
2. Скопируйте содержимое приватного ключа `deploy_key` целиком (включая `-----BEGIN OPENSSH PRIVATE KEY-----` и `-----END OPENSSH PRIVATE KEY-----`) и вставьте в секрет `SERVER_SSH_KEY` на GitHub.

---

## 💾 База данных и сохранение данных

- Проект использует легковесную базу данных **SQLite** (`better-sqlite3`), не требующую отдельного сервера баз данных.
- Файл базы данных хранится по пути `/app/data/kinostream.db` внутри контейнера.
- Этот путь смонтирован на Docker Volume `kino_data`, поэтому **все пользователи, пароли, избранное и история просмотров сохраняются при перезапусках, обновлениях и пересборках контейнера**.

### Резервное копирование (бэкап):
Сделать резервную копию базы данных можно одной командой:
```bash
docker cp kino2_web:/app/data/kinostream.db ./kinostream_backup_$(date +%Y%m%d).db
```

Восстановить из резервной копии:
```bash
docker cp ./kinostream_backup_20261111.db kino2_web:/app/data/kinostream.db
docker compose restart web
```

---

## 🛠️ Полезные команды для управления на сервере

```bash
# Просмотр логов веб-сервиса в реальном времени
docker compose logs -f web

# Просмотр логов TorrServer
docker compose logs -f torrserver

# Перезапуск всех сервисов
docker compose restart

# Остановка всех сервисов
docker compose down

# Обновление и ручной перезапуск с пересборкой
git pull
docker compose up -d --build
```
