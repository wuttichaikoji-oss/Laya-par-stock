Laya Liquor Usage & Par Cut v1.6 — Firebase Cloud Edition
=========================================================

เวอร์ชันนี้ทำเพื่อขึ้นเว็บและเก็บข้อมูลทั้งหมดลง Firebase Firestore

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
4) เอา Rules ใน firestore-rules.txt ไปวางใน Firestore Rules แล้ว Publish
5) เอาค่า config จาก Firebase Console มาใส่ใน firebase-config.js
6) อัปโหลดไฟล์ทั้งหมดขึ้น GitHub Pages หรือ Firebase Hosting
7) ถ้าใช้ GitHub Pages ให้เพิ่มโดเมน yourname.github.io ใน Authentication > Settings > Authorized domains

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
- เวอร์นี้ต้องเปิดผ่าน http/https เช่น GitHub Pages หรือ Firebase Hosting
- ถ้าอยากให้มีระบบ login พนักงานจริง ๆ สามารถต่อ email/password เพิ่มภายหลังได้
