Laya Liquor Usage & Par Cut v1.7 Security Edition
=================================================

เวอร์ชันนี้เพิ่มระบบความปลอดภัยหลัก 4 ส่วน
1) Login แบบ Email/Password
2) Role-based access: admin / supervisor / staff
3) Finalize Day + Unlock Day
4) Audit Log ทุกการเพิ่ม/แก้ไข/soft delete/finalize

สิ่งที่ต้องเปิดใน Firebase Console
-----------------------------------
1. Authentication > Sign-in method > เปิด Email/Password
2. ปิด Anonymous ถ้าไม่ต้องการให้ใช้ต่อ
3. Firestore Database > สร้างฐานข้อมูล ถ้ายังไม่มี
4. Publish rules จากไฟล์ firestore-rules.txt

โครงสร้าง user profile ที่ต้องมี
--------------------------------
สร้างเอกสารที่ path:
  tenants/laya-liquor/users/UID_ของผู้ใช้

ตัวอย่างข้อมูล:
{
  "displayName": "Noi",
  "role": "admin",
  "outlet": "Mangrove",
  "active": true
}

role ที่ใช้ได้:
- admin
- supervisor
- staff

หลักการสิทธิ์
-------------
admin
- ดูได้ทุก outlet
- เพิ่ม/แก้ master
- ปลดล็อกวันได้
- ทำ soft delete ได้
- ดู audit log ได้

supervisor
- ดูและคีย์ข้อมูลได้เฉพาะ outlet ตัวเอง
- เพิ่ม/แก้ Liquor Master และ Recipe ได้ใน outlet ตัวเอง
- Finalize วันได้
- ดู audit log ของ outlet ตัวเองได้

staff
- คีย์ยอดขาย / movement / actual count ได้เฉพาะ outlet ตัวเอง
- ลบไม่ได้
- แก้ master ไม่ได้
- ถ้าวันถูก finalize แล้ว แก้ไม่ได้

ขั้นตอนเริ่มใช้งาน
-------------------
1. อัปไฟล์ขึ้นเว็บ
2. เปิดหน้า Settings > Setup Firebase แล้วเชื่อมโปรเจกต์ Firebase
3. Login ด้วยบัญชี Email/Password
4. ถ้าล็อกอินแล้วเข้าระบบไม่ได้ ให้เช็กว่ามี user profile ใน Firestore หรือยัง และ active=true หรือไม่

หมายเหตุเรื่องการสร้างผู้ใช้
----------------------------
การสร้างบัญชี Email/Password แนะนำให้ทำใน Firebase Authentication Console ก่อน
แล้วค่อยสร้าง user profile doc ตาม UID ของผู้ใช้นั้นใน Firestore

soft delete
-----------
ระบบนี้ไม่ลบข้อมูลจริงสำหรับรายการสำคัญ
แต่จะ mark เป็น isDeleted=true และบันทึก audit log ไว้
เพื่อให้ตรวจย้อนหลังได้

Finalize Day
------------
เมื่อ Supervisor/Admin กด Finalize วัน
- sales / movements / counts ของวันนั้นจะถูกล็อก
- staff และ supervisor จะแก้ไม่ได้
- admin เท่านั้นที่ปลดล็อกได้
