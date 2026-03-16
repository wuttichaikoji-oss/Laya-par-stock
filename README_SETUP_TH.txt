Laya Liquor Usage & Par Cut v1.6.1 — Firebase Cloud Edition
===========================================================

เวอร์ชันนี้เพิ่ม **Firebase Setup Wizard** บนหน้าเว็บ

หน่อยมี 2 วิธีในการตั้งค่า Firebase
1) กรอกค่าในหน้าเว็บ แล้วกดบันทึกไว้ใน browser ของเครื่องนั้น
2) กรอกค่าในหน้าเว็บ แล้วกดดาวน์โหลด `firebase-config.js` เพื่อนำไฟล์ไปแทนของเดิมบนเว็บ

ข้อมูลที่เก็บบนคลาวด์
- Liquor Master
- Recipe Master
- Daily Sales Entry
- Movements (Receive / Transfer / Breakage / Comp / Staff / Adjustment)
- Actual Count
- Daily Report / Par Cut ใช้ข้อมูลจาก Firestore โดยตรง

ขั้นตอนตั้งค่าแบบสั้น
1) สร้าง Firebase Project และเพิ่ม Web App
2) เปิด Firestore Database
3) เปิด Authentication > Sign-in method > Anonymous
4) เอา Rules ใน `firestore-rules.txt` ไปวางใน Firestore Rules แล้ว Publish
5) เปิดเว็บ `index.html`
6) ไปที่หน้า **Setup Firebase** หรือแท็บ **Settings**
7) กรอกค่า Firebase จาก Firebase Console
8) กด **บันทึกใน browser และเชื่อมต่อ**
9) ถ้าต้องการให้เว็บเครื่องอื่นใช้ config เดียวกัน ให้กด **ดาวน์โหลด firebase-config.js** แล้วอัปโหลดไฟล์นั้นขึ้นเว็บแทนของเดิม

ถ้าจะใช้ GitHub Pages
- อัปโหลดไฟล์ทั้งหมดขึ้น repo / branch ที่ใช้ publish
- เพิ่มโดเมนของเว็บนั้นใน Firebase Authentication > Authorized domains

โครงสร้างข้อมูล
/tenants/{tenantId}/liquors/{liquorId}
/tenants/{tenantId}/recipes/{recipeId}
/tenants/{tenantId}/sales/{date_outlet_recipe}
/tenants/{tenantId}/movements/{date_outlet_liquor_kind}
/tenants/{tenantId}/counts/{date_outlet_liquor}

ใช้งานประจำวัน
- ตั้ง Liquor Master ครั้งแรก
- ตั้ง Recipe Master ครั้งแรก
- หลังปิดร้านไปหน้า Daily Entry
- เลือกวันที่ / outlet
- คีย์ยอดขายตามกระดาษ
- เพิ่ม movement ถ้ามี
- เพิ่ม actual count ถ้ามีนับจริง
- ไปหน้า Daily Report เพื่อดู usage / variance / par cut และพิมพ์ใบเบิก

หมายเหตุ
- browser/localStorage setup ใช้สะดวกมากสำหรับเครื่องนี้ทันที
- ถ้าจะใช้งานหลายเครื่องในทีม แนะนำดาวน์โหลดไฟล์ `firebase-config.js` แล้วอัปโหลดขึ้นเว็บเพื่อให้ทุกคนใช้ config เดียวกัน
- เวอร์นี้ต้องเปิดผ่าน http/https เช่น GitHub Pages หรือ Firebase Hosting เพื่อใช้งานจริงได้เต็มรูปแบบ
