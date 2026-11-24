# คู่มือติดตั้งเว็บไซต์ สบท. สำหรับศูนย์เทคโนโลยีสารสนเทศ

เว็บไซต์สำนักบริหารทรัพยากรบุคคล (สบท.) สำนักงานการตรวจเงินแผ่นดิน
ระบบเต็ม: หน้าเว็บ + หลังบ้านสำหรับลงข้อมูล (CMS)

## ภาพรวมระบบ

| ส่วน | รายละเอียด |
|---|---|
| เทคโนโลยี | [Astro](https://astro.build) (server-rendered) + [EmDash CMS](https://github.com/emdash-cms/emdash) รันบน Node.js |
| ฐานข้อมูล | SQLite ไฟล์เดียว: `data.db` (ข้อมูลทั้งหมด: ข้อความ การตั้งค่า เมนู ผู้ใช้) |
| ไฟล์ที่อัปโหลด | โฟลเดอร์ `uploads/` (PDF รูป วิดีโอ ประมาณ 300 MB) |
| หลังบ้าน | `https://<โดเมน>/_emdash/admin` (หรือ `/admin`) |
| กุญแจเข้ารหัส | ไฟล์ `.env` (**ไม่อยู่ใน Git** ส่งให้แยกต่างหาก) |

ทั้ง `data.db` และ `uploads/` อยู่ใน repository นี้แล้ว เป็นข้อมูลจริง ณ วันที่ส่งมอบ

## วิธีที่ง่ายที่สุด: Docker (แนะนำ)

ระบบทั้งหมดอยู่ใน container เดียว ไม่ต้องติดตั้ง Node.js บน server ข้อมูล (ฐานข้อมูล ไฟล์อัปโหลด ตัวนับผู้เข้าชม) เก็บใน volume `/data` ตอนเริ่มครั้งแรก ระบบจะคัดลอกข้อมูล ณ วันที่ส่งมอบลงใน volume เอง ครั้งต่อไปจะใช้ข้อมูลใน volume ต่อ ไม่เขียนทับ

ต้องมี Docker Engine 20+ (หรือ Podman) และไฟล์ `.env` ตาม `.env.example` ที่ใส่ `EMDASH_ENCRYPTION_KEY` ที่ได้รับแยกแล้ว

**ทางที่ 1: โหลด image สำเร็จรูป** (ไฟล์ `hr-sao-web-amd64.tar.gz` ที่ผู้พัฒนาส่งให้ ใช้กับ server แบบ x86-64 ได้โดยไม่ต้องต่ออินเทอร์เน็ต)
```bash
docker load -i hr-sao-web-amd64.tar.gz
docker run -d --name hr-sao-web --restart unless-stopped \
  --env-file .env -e HOST=0.0.0.0 -e PORT=4321 \
  -p 4321:4321 -v hr-sao-data:/data hr-sao-web:latest
```

**ทางที่ 2: build จาก repository นี้** (ต้องออกอินเทอร์เน็ตได้ตอน build)
```bash
git clone <repository-url> hr-sao-site && cd hr-sao-site
cp .env.example .env    # แล้วแก้ค่าใน .env
docker compose up -d --build
```

จากนั้นตั้ง reverse proxy (HTTPS) ชี้ไปที่พอร์ต 4321 ตามหัวข้อ "Reverse proxy" ด้านล่าง และตั้ง `EMDASH_SITE_URL` ใน `.env` ให้ตรงกับโดเมนจริง

| งาน | คำสั่ง |
|---|---|
| ดู log | `docker logs -f hr-sao-web` |
| สำรองฐานข้อมูล (ขณะระบบทำงาน) | `docker exec hr-sao-web node -e "new (require('node:sqlite').DatabaseSync)('data.db').exec(\"VACUUM INTO 'backup.db'\")" && docker cp hr-sao-web:/data/backup.db ./backup-$(date +%F).db` |
| สำรองไฟล์อัปโหลด | `docker cp hr-sao-web:/data/uploads ./uploads-$(date +%F)` |
| อัปเดตเป็น image ใหม่ | `docker load -i <ไฟล์ใหม่>` แล้ว `docker rm -f hr-sao-web` และรัน `docker run` เดิมอีกครั้ง (ข้อมูลใน volume `hr-sao-data` ยังอยู่) |

ถ้าใช้ Docker หัวข้อ "สิ่งที่ server ต้องมี" และ "ขั้นตอนติดตั้ง" ด้านล่างข้ามได้ ส่วน "การเข้าหลังบ้านครั้งแรกบนโดเมนใหม่" ยังต้องทำ (SSH tunnel ไปที่พอร์ต 4321 ของ server เหมือนกัน)

## สิ่งที่ server ต้องมี (กรณีไม่ใช้ Docker)

- Node.js **22.16 ขึ้นไป** (ทดสอบกับ Node 24)
- npm (มากับ Node.js)
- พื้นที่ดิสก์อย่างน้อย 2 GB (รวม node_modules และไฟล์อัปโหลดในอนาคต)
- Reverse proxy ที่ทำ HTTPS (Nginx / Apache / IIS)
- ระบบไฟล์รองรับชื่อไฟล์ UTF-8 (มีชื่อไทยบางส่วน)

## ขั้นตอนติดตั้ง

```bash
git clone <repository-url> hr-sao-site
cd hr-sao-site

# 1) ตั้งค่า
cp .env.example .env
#    แก้ .env:
#    - EMDASH_ENCRYPTION_KEY = ค่าที่ได้รับแยกจากผู้พัฒนา (ต้องเป็นค่าเดิม)
#    - EMDASH_SITE_URL      = https://<โดเมนจริง>
#    - PORT / HOST          = พอร์ตที่ Node ฟัง (เช่น 4321 / 127.0.0.1)

# 2) ติดตั้งและ build
npm ci
npm run build

# 3) รัน
npm start            # = node ./dist/server/entry.mjs
```

เปิด `http://127.0.0.1:4321` บน server เพื่อตรวจว่าหน้าแรกขึ้น

### ให้รันอัตโนมัติ (ตัวอย่าง systemd)

```ini
# /etc/systemd/system/hr-sao.service
[Unit]
Description=HR SAO website
After=network.target

[Service]
WorkingDirectory=/opt/hr-sao-site
EnvironmentFile=/opt/hr-sao-site/.env
ExecStart=/usr/bin/node ./dist/server/entry.mjs
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

ผู้ใช้ที่รันต้อง **เขียนได้** ใน `data.db` (รวมไฟล์ `data.db-wal`, `data.db-shm` ที่ SQLite สร้างข้างกัน) และใน `uploads/`

### Reverse proxy (ตัวอย่าง Nginx)

```nginx
server {
    server_name hr.example.go.th;
    client_max_body_size 200m;          # ระบบรับไฟล์อัปโหลดได้ถึง 200 MB

    location / {
        proxy_pass http://127.0.0.1:4321;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## สำรองข้อมูล

สำรองเป็นประจำ 2 อย่าง:

1. **ฐานข้อมูล** ใช้คำสั่งนี้ (ปลอดภัยแม้ระบบกำลังทำงาน):
   ```bash
   sqlite3 data.db ".backup backup-$(date +%F).db"
   ```
2. **โฟลเดอร์ `uploads/`** ทั้งโฟลเดอร์

อย่าคัดลอก `data.db` ตรง ๆ ขณะระบบทำงาน เพราะข้อมูลล่าสุดอาจยังอยู่ใน `data.db-wal`

## การเข้าหลังบ้านครั้งแรกบนโดเมนใหม่

บัญชีผู้ดูแลใช้ **passkey** ซึ่งผูกกับที่อยู่เว็บที่สร้างไว้ (ตอนพัฒนาคือ `localhost`) บนโดเมนใหม่จึงต้องย้ายการล็อกอินหนึ่งครั้ง **ทำร่วมกับผู้พัฒนา ใช้เวลาไม่กี่นาที**:

1. รันระบบบน server แล้วเปิดช่อง SSH tunnel จากเครื่องผู้ดูแล
   `ssh -L 4321:127.0.0.1:4321 <user>@<server>`
2. ผู้ดูแลเปิด `http://localhost:4321/_emdash/admin` บนเครื่องตัวเอง และล็อกอินด้วย passkey เดิม
3. ในหลังบ้าน ไปที่ Settings แล้วตั้ง Site URL เป็นโดเมนจริง จากนั้นใช้ "ย้ายไปที่อยู่ใหม่" (sign-in handover) ระบบจะให้ลิงก์ล็อกอินครั้งเดียว ใช้ได้ 5 นาที
4. เปิดลิงก์นั้นบนโดเมนจริง แล้วเพิ่ม passkey ใหม่ จากนั้นเพิ่มหรือเชิญผู้ใช้อื่นได้ที่ Users

## อัปเดตโค้ดในอนาคต

```bash
git pull
npm ci
npm run build
sudo systemctl restart hr-sao
```

**ระวัง:** repository นี้มี `data.db` และ `uploads/` ของวันส่งมอบอยู่ด้วย หลังเปิดใช้งานจริง ข้อมูลบน server จะเปลี่ยนไปเรื่อย ๆ อย่าให้ `git pull` เขียนทับไฟล์ข้อมูลบน server
**แนะนำ:** หลังติดตั้งครั้งแรก รัน `git update-index --skip-worktree data.db` หรือเก็บข้อมูลจริงไว้นอกโฟลเดอร์โค้ด

## ใช้งานบนเครือข่ายภายใน (Intranet)

ตัวเว็บทำงานได้โดยไม่ต้องต่ออินเทอร์เน็ต ฟอนต์ (K2D, Noto Serif Thai, Prompt) อยู่ใน `public/fonts/` และไลบรารีของหน้า dashboard อยู่ใน `public/vendor/` ทั้งหมดเก็บไว้ในเครื่องแล้ว ไฟล์ที่อัปโหลดไว้ทั้งหมดอยู่ใน `uploads/` และเนื้อหาอยู่ใน `data.db`

**ตอนติดตั้ง:** `npm ci` ต้องดาวน์โหลดแพ็กเกจจาก npm registry ถ้า server ออกอินเทอร์เน็ตไม่ได้ ให้เลือกทางใดทางหนึ่ง
- ใช้ npm mirror ภายในองค์กร
- หรือรัน `npm ci && npm run build` บนเครื่องที่ต่ออินเทอร์เน็ตได้และใช้ OS / สถาปัตยกรรมเดียวกับ server แล้วคัดลอกทั้งโฟลเดอร์ (รวม `node_modules/` และ `dist/`) ไปที่ server

**ส่วนที่ต้องให้เครื่องผู้ใช้ออกอินเทอร์เน็ตได้:** ส่วนเหล่านี้เป็นลิงก์หรือข้อมูลบนบริการภายนอกโดยธรรมชาติ ตัวเว็บยังเปิดได้ แต่ส่วนนั้นจะใช้ไม่ได้
| ส่วน | บริการภายนอก |
|---|---|
| หน้า `/dashboards/dpis6-attendance.html` (สถิติการลงเวลา DPIS6) | ดึงข้อมูลจาก Google Sheets |
| ลิงก์แบบฟอร์ม / แบบสำรวจ | Google Forms (forms.gle), Google Drive |
| รายงาน dashboard บางรายการ | Looker Studio |
| วิดีโอในหน้าผลงาน | YouTube |
| ลิงก์ไปเว็บ สตง. | audit.go.th, dpis6.audit.go.th |

## ปัญหาที่พบบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| หน้าเว็บขึ้น แต่ล็อกอินหลังบ้านไม่ได้ | `EMDASH_SITE_URL` ไม่ตรงกับโดเมนที่เปิด หรือ proxy ไม่ส่ง `X-Forwarded-*` |
| อัปโหลดไฟล์ใหญ่ไม่ได้ | ตั้ง `client_max_body_size` (หรือค่าที่เทียบเท่า) ให้ ≥ 200 MB |
| ค่าตั้งบางอย่างอ่านไม่ได้ / error เรื่องการเข้ารหัส | `EMDASH_ENCRYPTION_KEY` ไม่ใช่ค่าเดิม |
| `npm ci` ล้มเหลว | ตรวจเวอร์ชัน Node.js (ต้อง ≥ 22.16) |

ผู้ติดต่อฝั่งเนื้อหาและระบบ: สำนักบริหารทรัพยากรบุคคล (สบท.)
