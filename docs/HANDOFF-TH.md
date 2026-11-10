# ส่งมอบ NyxSkill 1.1.0

พัฒนาต่อจาก repository เดิม โดยรักษา API1, ID เดิม, 5 runtime adapters และไฟล์เดิมของผู้ใช้ ปัจจุบันมี **95 skills / 13 packs / 14 profiles** เพิ่มจาก baseline 87/12

## สิ่งที่เพิ่มและปรับ
- เพิ่ม Reverse Engineering 8 skills: reverse-triage, binary-analysis, dotnet-reverse, android-reverse, javascript-reverse, protocol-analysis, firmware-analysis, reverse-report พร้อมเครื่องมือ static inventory ที่อยู่ใน skill และไม่รันตัวอย่าง
- เพิ่ม pack-based plugin generator: portable plugin.json, Codex/Claude overlays, ZIP และ local marketplace; managed local install/discovery/update/uninstall พร้อมเก็บ backup และปฏิเสธไฟล์ที่แก้ไข
- แก้ router ให้ dependency ที่ขาด/ไม่รองรับ runtime/ขัดกัน/เป็นวงจรไม่สร้าง workflow บางส่วน เพิ่ม negative triggers และ capability allow-list; CLI รองรับ --policy FILE
- ป้องกัน runtime rebuild ทับข้อมูลที่ไม่มี ownership inventory รวมถึงโฟลเดอร์ว่างของผู้ใช้; runtime paths เป็น relative
- ป้องกัน imported pack traversal, symlink, CRC/header corruption, ZIP budgets, self-declared trust และ destructive uninstall; legacy install ต้อง migrate แบบตรวจสอบเอง
- ปรับ 7 skills เดิม: writing-plans, executing-plans, code-review, code-simplification, feature-spec, frontend-ui-engineering, release-check รวม persistent recovery และ reuse checks โดยไม่สร้าง planner/skills ซ้ำ
- ใช้สกิลเดิมด้าน debugging/TDD/API/security/design/research แทนการคัดลอกทั้ง framework มี decision matrix ครบ 18 upstream sources
- เพิ่ม optional local Graphify inspection/cross-reference query และ OmniRoute manifest/explicit loopback health adapters ปิดไว้โดยปริยาย
- เพิ่ม catalog, architecture, security, migration, compatibility, source evidence, checkpoint, lock content hashes และ reproducible source/portable packaging

ไฟล์หลัก: src/plugins.ts, src/router.ts, src/packs.ts, src/zip.ts, src/integrations.ts, src/documents.ts, src/adapters/index.ts, src/release.ts, src/cli.ts, skills/reverse-engineering, packs/reverse-engineering.yaml, docs และ tests ใหม่ ดู Git diff สำหรับขอบเขตจริง โดย scripts/release.mjs เป็นการแก้ไขเดิมของผู้ใช้

## ตรวจสอบแล้ว
- ก่อนแก้: npm test ผ่าน 27/27
- หลังแก้: npm test ผ่าน 72/72 ไม่มี skip; build/typecheck ผ่าน
- doctor และ validate --all ผ่าน 95 skills / 13 packs / 14 profiles
- Regression RED → GREEN สำหรับ router และ imported-package security
- portable/source ZIP สร้างซ้ำต่างโฟลเดอร์แล้ว bytes เท่ากัน
- git diff --check ผ่าน; source review แก้ตัวอย่างติดตั้งเวอร์ชันเก่าและการลบโฟลเดอร์ว่างที่ inventory เดิมตรวจไม่พบ

รายละเอียดคำสั่ง/ผลอยู่ COMPATIBILITY.md การสแกนชื่อไฟล์/รูปแบบ credential เป็นการป้องกันเสริม ไม่ใช่หลักฐานว่า secret ทุกชนิดตรวจพบ

## ใช้งาน
```bash
node dist/src/cli.js doctor
node dist/src/cli.js validate --all
node dist/src/cli.js route "inspect a .NET assembly" --profile reverse-engineering --explain
node dist/src/cli.js plugin build --out ./dist/plugins-review
node dist/src/cli.js plugin verify ./dist/plugins-review/plugins/nyx-reverse-engineering
node dist/src/cli.js plugin install ./dist/plugins-review/plugins/nyx-reverse-engineering --store ./dist/local-store
node dist/src/cli.js plugin list --store ./dist/local-store
node skills/reverse-engineering/reverse-triage/scripts/inventory.mjs ./sample.dll
node dist/src/cli.js integration graphify
```

Standalone: คัดลอก skill directory พร้อม resources หรือใช้ runtime build เดิม Complete pack: ใช้ plugin build --pack ID; ดู INSTALL.md และ PLUGINS.md สำหรับ marketplace/native-host steps

## ข้อจำกัดและงานถัดไป
ยังไม่ผ่าน native host activation ของ Codex/Claude/Cursor/Inwjud, WSL/Linux, Graphify export จริง, OmniRoute จริง หรือ dynamic reverse tools การตรวจ CLI help ของ Codex ไม่ถือเป็น install acceptance

ตั้งใจไม่รวม upstream frameworks ทั้งชุด, lifecycle hooks/installers, Graphify Cloud/extraction, provider replacement, model/quota/fallback APIs, credential access, global host settings และ dynamic sample execution เงื่อนไข license/ทรัพยากรของ Trail of Bits, Figma และ upstream บางส่วนทำให้ deferred import ตาม INTEGRATION-DECISIONS.md ไม่มีการเปลี่ยนชื่อเนื้อหาเหล่านั้นเป็น MIT

ขั้นถัดไปคือ native host acceptance ในสภาพแวดล้อมที่แยกและกำหนดไว้, ตรวจ Graphify export schema จริง และทดสอบ optional services/tools ที่ผู้ใช้เลือก โดยใช้ checkpoint เดิมและไม่ทำซ้ำขั้นที่ผ่านแล้ว ไม่มี push/publish/deploy ในงานนี้
