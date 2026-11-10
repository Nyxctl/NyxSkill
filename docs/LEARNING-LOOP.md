# NyxSkill Learning Loop

ระบบพร้อมใช้ผ่าน CLI จากซอร์สหลัง `npm run build` ตัวอย่างด้านล่างใช้คำสั่ง `nyxskill` สำหรับชุดติดตั้งที่มีฟีเจอร์นี้แล้ว ในเครื่องพัฒนาที่คำสั่งบน PATH ยังเป็นชุดเดิม ให้รัน `node dist/src/cli.js` จากราก NyxSkill แทน ระเบียนอยู่ใน `<project>/.nyxskill/learning/v1/` แต่ละคำสั่งเลือกโปรเจกต์ด้วย `--project` ค่าเริ่มต้นคือโฟลเดอร์ปัจจุบัน `--root` ยังระบุตำแหน่ง registry ของ NyxSkill แยกจากโปรเจกต์

## บันทึกบทเรียนหรือขั้นตอน

```json
{
  "kind": "lesson",
  "taskTags": ["installer"],
  "scope": {"platform": "win32", "taskKind": "installer", "evidenceLevel": "host"},
  "observation": "Doctor could read VM metadata",
  "outcome": "Hyper-V management was inaccessible",
  "nextCheck": "Check management permissions and run plan separately"
}
```

สำหรับ `kind: procedure` ใช้ฟิลด์ร่วม `skillId`, `taskTags`, `scope` และเพิ่ม `title`, `preconditions` เป็นรายการข้อความ, `steps` เป็นรายการข้อความที่อ่านทบทวนได้, `expectedChecks` เป็นรายการ ID และ `lessonIds` เป็น UUID ที่เกี่ยวข้องถ้ามี ขอบเขตเพิ่ม `targetKind`, `toolVersions` แบบ object และ `capabilities` แบบรายการได้ สกิลใหม่ที่ยังไม่มีใน registry ใช้ ID `local.workflow.<slug>` สำหรับเสนอ diff

```powershell
nyxskill learn record --from lesson.json --project .
nyxskill learn list --project .
nyxskill learn show RECORD_ID --project .
nyxskill route "test Windows installer in VM" --learning --project . --learning-tag installer --learning-scope scope.json --json
```

`scope.json` ใช้รูปเดียวกับ `scope` ในระเบียน กรอกข้อมูลสภาพแวดล้อมที่ตรวจได้จากงานปัจจุบัน เมื่อไม่มีบริบทพอ ระบบคืนบทเรียนที่เกี่ยวข้องได้และแจ้ง `needs-recheck` สำหรับขั้นตอนที่ยังยืนยันเงื่อนไขไม่ได้ การดึงขั้นตอนเป็นคำแนะนำสำหรับเริ่มงานและต้องตรวจผลรอบใหม่

## ผูกขั้นตอนกับหลักฐาน


```powershell
nyxskill learn verify RECORD_ID --evidence evidence.json --expected expected.json --project .
nyxskill learn revise RECORD_ID --from revised-procedure.json --revision 2 --project .
nyxskill learn retire RECORD_ID --reason "Workflow superseded" --project .
nyxskill learn propose RECORD_ID --project .
```


## ข้อมูลและการกู้คืน

เปิดใช้การค้นด้วย `--learning` และใช้คำสั่ง `learn` เพื่อบันทึกหรือแก้สถานะ สกิล Project Retrospective และ Verification มีขั้นตอนสำหรับงานที่เปิดใช้ learning และอนุญาตให้เขียนข้อมูล กติกาสร้างสกิลฉบับร่างก่อนส่งงานยังทำงานแยกกันตามขอบเขตที่กำหนดใน AGENTS.md

Store ใช้ revision แบบไม่เขียนทับ พร้อม lock และเผยแพร่ไฟล์ที่เขียนครบผ่าน hard link บน filesystem เดียวกัน ใช้ filesystem ที่รองรับ hard link เช่น NTFS เมื่อเจอ busy ให้ตรวจ `.lock/owner.json` แล้วใช้ `learn recover --token TOKEN --project PATH` หลังตรวจเจ้าของเดิม คำสั่งตรวจชื่อ host และ PID ก่อนย้าย lock ไปเก็บเป็นหลักฐาน ไฟล์ชั่วคราวจากการหยุดกลางคันถูกข้ามเมื่ออ่าน

เพดานรวม 500 ID และ 128 revision ต่อ ID การถอนใช้ยังเก็บประวัติ เมื่อเต็มให้ผู้ดูแลจัดเก็บระเบียนที่ถอนใช้แยกจาก store Git ควร ignore `.nyxskill/learning/` และ `.nyxskill/skill-drafts/` ชุดแพ็กของ NyxSkill ใช้รายการโฟลเดอร์ที่กำหนดไว้ซึ่งอยู่นอก store นี้

ชุดทดสอบ `tests/learning.test.mjs` ใช้ fixture สำหรับหลักฐาน host และตรวจ CLI จริงบนเครื่องพัฒนา การวัดผลบนโจทย์ที่กันไว้และ guest acceptance จริงเป็นขั้นประเมินแยกตาม Full Design

Guest evidence verification is deferred. Use host or interactive evidence in this build.
