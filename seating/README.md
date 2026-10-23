# ClassroomHub v9 — ระบบจองห้องเรียนพร้อมเตรียมเปิดใช้งานจริง

เวอร์ชันนี้พัฒนาต่อจาก ClassroomHub v8 โดยรักษาผัง **40 โต๊ะ** ที่คุณวาดไว้: A–J ซ้ายไปขวา / เลข 1–6 หน้าไปหลัง, มีช่องว่างและทางเดินตามผังเดิม

## ความสามารถ

- **PUBLIC TEST**: เพื่อน ๆ ทดลองจองพร้อมกันผ่านเว็บเดียวกันได้ **หลังเชื่อม Supabase**; แยกรายการออกจากรอบจริง
- **LIVE**: ยืนยันอีเมลและเทียบเลขที่ในรายชื่อ (ตั้งค่า roster โดยผู้ดูแล)
- หนึ่งคนจองตัวเอง 1 โต๊ะ และจองแทนคนอื่นได้เพิ่มเติม (แต่ผู้รับหนึ่งคนรับได้หนึ่งโต๊ะใน LIVE)
- เลือกโต๊ะแล้วฐานข้อมูลจะ **ล็อก 2 นาที**; ผู้ใช้คนอื่นเห็นสถานะ “กำลังจอง” และไม่สามารถจองซ้ำได้
- ยืนยันข้อมูลอีกครั้งก่อนส่ง, แสดง **“ยินดีด้วย! คุณจองสำเร็จแล้ว”** พร้อมบัตรที่นั่งและเอฟเฟกต์
- เปิดจองตามวันที่/เวลาที่ตั้งในฐานข้อมูล; นับถอยหลังแบบปกติ **ไม่มีแอนิเมชัน 5–1 เต็มจอ**
- หน้าผู้ดูแลดู/แก้/ลบการจอง, ปิดโต๊ะ, เปิดจองทันที, เปลี่ยน Test/Live, ล้างเฉพาะรายการทดลอง, ตั้งเวลาโดยพิมพ์หรือเลือกปฏิทินพร้อม **ตรวจสอบ → ยืนยัน**
- เวลาหน้าจออ้างอิงเวลาจากเซิร์ฟเวอร์และใช้ `performance.now()` ระหว่างการซิงก์; **RPC ของ PostgreSQL ตัดสินเวลาและสิทธิ์จริง**
- **เมื่อออนไลน์ขัดข้อง จะปิดปุ่มจองชั่วคราว** แทนการยืนยันจากสถานะเก่าบนหน้าเว็บ

## ทดลองทันทีใน VS Code (เฉพาะเครื่อง)

1. เปิดโฟลเดอร์โปรเจกต์ด้วย VS Code
2. เปิดไฟล์ `index.html` ผ่าน Live Server หรือรัน `python -m http.server 5500` ใน Terminal แล้วเข้า `http://localhost:5500`
3. ตอน `config.js` ยังว่าง เว็บอยู่ในโหมด **LOCAL DEMO** ใช้ localStorage ของเบราว์เซอร์เท่านั้น
4. เข้าหน้าผู้ดูแล LOCAL DEMO ด้วยรหัส **280806**. **รหัสนี้ไม่ปลอดภัยสำหรับออนไลน์และใช้ไม่ได้เป็นสิทธิ์ผู้ดูแลระบบจริง**

## เปิดให้เพื่อนทดสอบพร้อมกันด้วย Supabase (ขั้นตอนจำเป็น)

1. เข้า [Supabase](https://supabase.com/) สร้างโปรเจกต์ใหม่ (แนะนำแยกโปรเจกต์ทดสอบจากข้อมูลจริง)
2. เปิด **Authentication → Providers → Anonymous Sign-ins** สำหรับ PUBLIC TEST; ตั้งค่า CAPTCHA / จำกัดการเข้าถึงตามเหมาะสมเพื่อป้องกันสแปม
3. เปิด **SQL Editor** แล้วรัน `supabase/schema.sql` **ในโปรเจกต์ใหม่** (ถ้าคุณมีข้อมูล v7/v8 ให้สำรองและดู `supabase/UPGRADE_V7.md` ก่อน ห้ามล้างข้อมูลจริงโดยไม่สำรอง)
4. ไปที่ **Project Settings → API** คัดลอก **Project URL** และ **publishable / anon key** มาใส่ `config.js` ดังนี้ (สองค่านี้ใช้เผยแพร่ในหน้าเว็บได้):

   ```js
   window.CLASSROOM_CONFIG = {
     supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
     supabaseAnonKey: 'YOUR-PUBLISHABLE-OR-ANON-KEY'
   };
   ```

   **ห้าม** ใส่ `service_role`, Secret key, รหัสผ่าน หรือข้อมูลส่วนตัวลงในไฟล์เว็บไซต์หรือ GitHub
5. รีโหลดหน้าเว็บ: ถ้าตั้งค่าสำเร็จ มุมด้านบนจะแสดง **เชื่อมต่อออนไลน์** และข้อมูลจะมาจากฐานข้อมูลร่วมกัน
6. ทดสอบในเบราว์เซอร์/มือถือ **2 เครื่อง** โดยใช้คนละบัญชี: เครื่องแรกเลือก A1 → เครื่องที่สองเห็น **กำลังจอง** กดไม่ได้ → เมื่อยืนยันเครื่องแรก เครื่องที่สองต้องเห็น **จองแล้ว**
7. เปิดใช้งาน Realtime สำหรับตาราง `state_signal` หากยังไม่แสดงสถานะทันที (ระบบยัง polling ประมาณทุก 2.5 วินาที)

## ผู้ดูแล ONLINE: ต้องใช้อีเมลยืนยัน ไม่ใช่ PIN

1. ตั้งค่า Authentication Email ใน Supabase และสร้างบัญชีผู้ดูแลที่ยืนยันอีเมลแล้ว โดยใช้รหัสผ่านที่แข็งแรงและไม่ซ้ำกับรหัสทดลอง
2. ใน SQL Editor ให้รัน (เปลี่ยนเป็นอีเมลของผู้ดูแล **ของคุณ**):

   ```sql
   insert into public.classroom_admins(user_id)
   select id from auth.users
   where lower(email)='admin@example.com'
     and is_anonymous=false and email_confirmed_at is not null
   on conflict do nothing;
   ```

3. เมื่อเชื่อม Supabase แล้ว กด **ผู้ดูแล** และเข้าสู่ระบบด้วยอีเมล/รหัสผ่านของ Supabase Auth
4. เพิ่มอีเมลนักเรียนและเลขที่ผ่านแท็บ **รายชื่อนักเรียน** แล้วกำหนดวัน–เวลาเปิดจอง
5. รอบ **LIVE** ใช้บัญชียืนยันอีเมล ผู้กดจองต้องอยู่ใน roster และเลขที่ของผู้รับต้องอยู่ใน roster ด้วย

## เผยแพร่ GitHub Pages

1. สร้าง Repository ชื่อ `classroomhub` (แนะนำ **private** ระหว่างเตรียมระบบ; การเผยแพร่หน้าเว็บผ่าน Pages อาจเป็นสาธารณะ แม้ repository จะ private)
2. อัปโหลด **ไฟล์ภายในโฟลเดอร์นี้** ไปที่ root ของ Repository เพื่อให้มี `index.html` ใน root
3. เปิด Settings → Pages → Build and deployment → Source: **Deploy from a branch** → `main` / `(root)` → Save
4. เมื่อ Pages สร้างเว็บไซต์แล้ว ให้นำ URL เว็บไซต์ไปกรอกใน Supabase → Authentication → URL Configuration → Site URL / Redirect URLs เพื่อให้ระบบยืนยันอีเมลกลับมาถูกหน้า
5. ถ้า `config.js` ยังไม่ตั้งค่า หรือ Supabase ยังไม่พร้อม เว็บไซต์อาจเปิดได้ แต่จะเป็น **LOCAL DEMO ไม่ใช่ระบบจองร่วมกัน**

อ่านเอกสาร `DEPLOY-CHECKLIST.md` เพื่อดูการตรวจสอบก่อนเปิดจองจริง

## การทดสอบที่รวมมา

```bash
node --check app.js
python tests/check_project.py
pip install playwright
python -m playwright install chromium
python tests/test_demo_browser.py
python tests/test_online_mock.py
```

ชุด Playwright ทดสอบ UI จริงใน Chromium, โหมด DEMO และ **ฐานข้อมูลออนไลน์จำลองสองผู้ใช้**: การล็อกชนกัน, ยืนยัน, ป้องกันเลือกซ้ำ และหยุดทำรายการตอนเน็ตขาด

**ขอบเขต:** ยังไม่ได้รันทดสอบ SQL บน Supabase จริงหรือโหลดพร้อมกัน 40 บัญชี การทดสอบ Mock ไม่ได้พิสูจน์ความถูกต้องของ SQL ที่ติดตั้งจริง ควรทำ staging → ตรวจสอบ RLS/สิทธิ์/อีเมล → ทดสอบพร้อมกันก่อนใช้งานจริง

## โครงสร้าง

```text
classroomhub-v9-launch-ready/
├── index.html
├── styles.css
├── app.js
├── config.js
├── .nojekyll
├── .github/workflows/checks.yml
├── supabase/schema.sql
├── supabase/UPGRADE_V7.md
├── tests/check_project.py
├── tests/test_demo_browser.py
├── tests/test_online_mock.py
├── DEPLOY-CHECKLIST.md
└── README.md
```

**ข้อมูลส่วนตัว:** รายชื่อนักเรียนเป็นข้อมูลส่วนบุคคล ผู้ดูแลเท่านั้นควรดู/แก้ได้ ไม่ควรส่งไฟล์รายชื่อหรือรายการจองขึ้น GitHub
