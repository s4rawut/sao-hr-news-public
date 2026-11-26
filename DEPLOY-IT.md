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

**ที่อยู่เว็บ (`EMDASH_SITE_URL`):** ตั้งแต่รุ่น 2569-11-26 image ที่ส่งให้ IT มีค่าเริ่มต้น `https://dev-hr-sao.audit.go.th` อยู่แล้ว ถ้าใน `.env` มีบรรทัด `EMDASH_SITE_URL` ค่าใน `.env` จะใช้แทน ถ้าตั้งเป็นค่าว่าง (`EMDASH_SITE_URL=`) ระบบจะใช้โดเมนที่ผู้ใช้เปิดเข้ามาเอง (เฉพาะโดเมนใต้ `audit.go.th`) ซึ่ง proxy ต้องส่ง `Host` หรือ `X-Forwarded-Host` และ `X-Forwarded-Proto` มาด้วย ดูค่าที่ใช้อยู่ได้จากบรรทัด `Site URL:` ใน `docker logs`

| งาน | คำสั่ง |
|---|---|
| ดู log | `docker logs -f hr-sao-web` |
| สำรองฐานข้อมูล (ขณะระบบทำงาน) | `docker exec hr-sao-web node -e "new (require('node:sqlite').DatabaseSync)('data.db').exec(\"VACUUM INTO 'backup.db'\")" && docker cp hr-sao-web:/data/backup.db ./backup-$(date +%F).db` |
| สำรองไฟล์อัปโหลด | `docker cp hr-sao-web:/data/uploads ./uploads-$(date +%F)` |
| อัปเดตเป็นรุ่นใหม่ (patch) | ทำตามไฟล์ `วิธีอัปเดต-patch-<รุ่น>.txt` ที่ส่งมากับ patch: สำรองข้อมูล → `docker load` → `docker rm -f hr-sao-web` → `docker run` เดิมโดยใช้ tag รุ่นใหม่ ข้อมูลใน volume `hr-sao-data` ยังอยู่ |

**Patch และการเปลี่ยนฐานข้อมูล:** ถ้ารุ่นใหม่ต้องปรับข้อมูลในฐานข้อมูลด้วย (เช่น ลำดับรายการ) จะมีไฟล์ใน `patches/` ซึ่ง container รันให้เองตอนเริ่ม ไฟล์ละครั้งเดียว และเปลี่ยนเฉพาะรายการที่ระบุ ไม่ลบหรือเขียนทับข้อมูลที่ผู้ดูแลเพิ่มไว้ ดูผลได้จาก `docker logs` (บรรทัด `apply-patches`) และดูรุ่นที่ใช้อยู่ได้จากบรรทัด `HR SAO website version` รายการเปลี่ยนแปลงแต่ละรุ่นอยู่ใน `CHANGELOG.md` ถ้าไม่ใช้ Docker ให้หยุดเว็บแล้วรัน `node scripts/apply-patches.mjs` ในโฟลเดอร์เว็บหลัง `git pull` และ build

ถ้าใช้ Docker หัวข้อ "สิ่งที่ server ต้องมี" และ "ขั้นตอนติดตั้ง" ด้านล่างข้ามได้ ส่วน "การเข้าหลังบ้านครั้งแรกบนโดเมนใหม่" ยังต้องทำ (ใช้คำสั่ง `docker exec hr-sao-web node /app/scripts/admin-login-link.mjs`)

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

> **สำคัญ:** หลังบ้านล็อกอินด้วย passkey ซึ่งเบราว์เซอร์อนุญาตเฉพาะเว็บที่เป็น **ชื่อโดเมน + HTTPS** เท่านั้น (เช่น `https://hr.intranet.oag.go.th`) ถ้าเปิดด้วยเลข IP หรือ `http://` จะล็อกอินหลังบ้านไม่ได้ (หน้าเว็บยังเปิดได้ปกติ) บนเครือข่ายภายในใช้ DNS ภายในและใบรับรองจาก CA ขององค์กรได้

บัญชีผู้ดูแลใช้ **passkey** ซึ่งผูกกับที่อยู่เว็บที่สร้างไว้ (ตอนพัฒนาคือ `localhost`) บนโดเมนใหม่จึงต้องสร้าง passkey ใหม่หนึ่งครั้ง โดยใช้ **ลิงก์ล็อกอินครั้งเดียว** ที่ IT สร้างจาก server (ต้องใช้ container รุ่น 2569-11-25-4 ขึ้นไป):

1. ตรวจว่า `.env` มี `EMDASH_SITE_URL=https://<โดเมนจริง>` และเปิด `https://<โดเมนจริง>` จากเครื่องผู้ดูแลได้ โดยเบราว์เซอร์ไม่เตือนเรื่องใบรับรอง (ถ้าใบรับรองไม่น่าเชื่อถือ เบราว์เซอร์จะไม่ยอมสร้าง passkey)
2. IT รันบน server:
   ```bash
   docker exec hr-sao-web node /app/scripts/admin-login-link.mjs
   ```
   จะได้ลิงก์ `https://<โดเมนจริง>/_emdash/api/auth/magic-link/verify?token=...` ใช้ได้ **ครั้งเดียว ภายใน 15 นาที** (ถ้ามีผู้ดูแลหลายคน ใส่อีเมลต่อท้าย: `... admin-login-link.mjs "" <อีเมล>`)
3. ส่งลิงก์ให้ผู้ดูแลทางช่องทางภายใน (ลิงก์นี้คือสิทธิ์เข้าหลังบ้าน ห้ามโพสต์ในที่สาธารณะ)
4. ผู้ดูแลเปิดลิงก์ กด **Continue** ระบบจะเข้าหน้า Security Settings ให้ตั้งชื่อ passkey แล้วกด **Register Passkey** และยืนยันด้วย Touch ID / Windows Hello / มือถือ
5. ครั้งต่อไปเข้า `https://<โดเมนจริง>/admin` แล้วล็อกอินด้วย passkey ได้เลย เพิ่มหรือเชิญผู้ใช้อื่นได้ที่เมนู **Users**

ลิงก์หมดอายุหรือใช้ไปแล้ว: รันคำสั่งในข้อ 2 ใหม่ได้ทุกเมื่อ ใช้คำสั่งเดียวกันนี้ได้ด้วยเมื่อผู้ดูแลเปลี่ยนเครื่องหรือทำ passkey หาย

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
