# Backend Design & Implementation Notes

# Overview

ระบบนี้เป็น API สำหรับบันทึกรายรับรายจ่ายส่วนบุคคล โดยผู้ใช้สามารถจัดการบัญชี, หมวดหมู่, transaction, slip attachment, report summary, import/export, monthly budget และ daily spending allowance ได้

แนวคิดหลักของการออกแบบคือ:

- แยก feature ตาม domain เพื่อให้โค้ดอ่านและขยายต่อได้ง่าย
- ใช้ PostgreSQL เพราะข้อมูลมีความสัมพันธ์ชัดเจนและต้อง query summary/filter หลายรูปแบบ
- ใช้ server-side session authentication แทน JWT ตามข้อกำหนดของโจทย์
- ให้ `transactions` เป็น source of truth แล้วคำนวณ report จากข้อมูลจริง
- ใช้ Joi validate ที่ boundary ของ request ก่อนเข้า business logic
- ใช้ migration สำหรับสร้าง schema เพื่อให้ reviewer รันระบบได้โดยไม่ต้องสร้าง table เอง

## Tech Stack

- TypeScript
- Node.js
- Fastify
- PostgreSQL
- TypeORM
- Joi
- ExcelJS
- csv-parse / csv-stringify
- Docker / Docker Compose
- Node.js built-in test runner

เหตุผลหลัก:

- **Fastify** เบาและเหมาะกับ API assignment ที่ต้องการ structure ชัดโดยไม่หนักเกินไป
- **PostgreSQL** เหมาะกับข้อมูล transaction ที่มี relation และการ aggregate summary
- **TypeORM** ช่วยให้ entity, migration และ repository ทำงานร่วมกันได้เป็นระบบ
- **Joi** ใช้ validate body, query และ params ได้ตรงไปตรงมา
- **ExcelJS + CSV libraries** ใช้รองรับ import/export challenge โดยไม่ต้องเขียน parser เอง

## Folder Structure

```text
src/
  app.ts
  server.ts
  common/
    auth/
    database/
    pagination/
    types/
    utils/
    validation/
  config/
    data-source.ts
    env.ts
  database/
    entities/
    enums/
    migrations/
  modules/
    accounts/
    auth/
    categories/
    reports/
    sessions/
    transactions/
  tests/
```

โครงสร้างนี้แยกตาม domain ไม่ได้แยกเป็น controller/service/repository กลางทั้งโปรเจกต์ตั้งแต่แรก เพราะ scope ของ assignment ยังเหมาะกับ module-based structure มากกว่า

- `common` เก็บสิ่งที่ใช้ร่วมกัน เช่น auth guard, validation, pagination
- `config` เก็บ environment และ database setup
- `database` เก็บ entity, enum และ migration
- `modules` เก็บ route และ logic ตาม feature
- `tests` เก็บ integration-style tests ผ่าน Fastify inject

## Application Startup

โปรเจกต์แยก entrypoint เป็น 2 ชั้น:

- `app.ts` สร้าง Fastify app, register plugin, register modules และ error handler
- `server.ts` start HTTP server จริง

ข้อดีคือ test สามารถ import `buildApp()` แล้วใช้ `app.inject()` ได้โดยไม่ต้องเปิด port จริง ทำให้ test เร็วและควบคุม environment ง่าย

## Database Design

### users

ใช้เก็บเจ้าของข้อมูลและข้อมูลสำหรับ login

ฟิลด์สำคัญ:

- `email`
- `password_hash`
- `display_name`
- `locale`

รหัสผ่านถูกเก็บเป็น hash เท่านั้น ไม่เก็บ plain text

### accounts

ใช้แทนแหล่งเงิน เช่น cash, bank, e-wallet, credit card

ฟิลด์สำคัญ:

- `user_id`
- `name`
- `type`
- `currency_code`
- `is_active`

ใช้ `is_active` แทนการ hard delete เพราะบัญชีที่เคยถูกใช้ใน transaction ไม่ควรหายจากรายงานย้อนหลัง

### categories

ใช้จัดประเภท transaction

ฟิลด์สำคัญ:

- `user_id`
- `name`
- `kind`
- `is_active`

`kind` เป็น `income` หรือ `expense` เพื่อป้องกันการใช้หมวดหมู่ผิดชนิด เช่น ใช้หมวดรายจ่ายกับรายการรายรับ

### monthly_budgets

ใช้รองรับ challenge เรื่องเงินที่สามารถใช้รายวันได้จนจบเดือน

ฟิลด์สำคัญ:

- `user_id`
- `year`
- `month`
- `planned_expense_limit`

แยก budget ออกจาก transaction เพราะ budget เป็นข้อมูลแผน ไม่ใช่รายการเงินที่เกิดขึ้นจริง

### transactions

เป็นตารางหลักของระบบ ใช้เก็บทั้ง income และ expense

ฟิลด์สำคัญ:

- `user_id`
- `account_id`
- `category_id`
- `type`
- `amount`
- `occurred_at`
- `note`
- `note_sanitized`

ใช้ตารางเดียวสำหรับ income/expense เพื่อให้ filter, summary, import/export และ report query ทำได้ง่ายกว่าแยกตาราง

ใช้ `occurred_at` สำหรับวันที่รายการเกิดขึ้นจริง เพราะ report ควรอิงวันที่เกิดรายการ ไม่ใช่วันที่สร้าง record

### transaction_attachments

ใช้เก็บ metadata ของ slip หรือหลักฐานการใช้จ่าย

ฟิลด์สำคัญ:

- `transaction_id`
- `storage_key`
- `original_filename`
- `mime_type`
- `file_size`

ไฟล์จริงเก็บใน `UPLOAD_DIR` ส่วน database เก็บ metadata เพื่อไม่ให้ row transaction หนักเกินไป และยังเปิดทางให้ย้ายไป object storage เช่น S3 ได้ภายหลัง

### sessions

ใช้สำหรับ custom authentication และรองรับหลายอุปกรณ์

ฟิลด์สำคัญ:

- `user_id`
- `token_hash`
- `device_id`
- `device_name`
- `user_agent`
- `ip_address`
- `status`
- `last_activity_at`
- `expires_at`
- `revoked_at`

ระบบเก็บเฉพาะ `token_hash` ไม่เก็บ raw session token เพื่อลดความเสี่ยงหาก database รั่ว

## Relationship Summary

- user 1 คน มีหลาย account
- user 1 คน มีหลาย category
- user 1 คน มีหลาย monthly budget
- user 1 คน มีหลาย transaction
- user 1 คน มีหลาย session
- transaction 1 รายการอยู่ใต้ account เดียว
- transaction 1 รายการอยู่ใต้ category เดียว
- transaction 1 รายการมี attachment ได้หลายไฟล์

## Entity And Migration Decisions

ทุก entity หลัก inherit จาก base entity ที่มี:

- `id`
- `created_at`
- `updated_at`

เงินใช้ `numeric(14,2)` เพราะข้อมูลการเงินไม่ควรใช้ floating point

runtime ปกติปิด TypeORM `synchronize` และใช้ migration แทน เพื่อให้ schema change มีประวัติและรันซ้ำได้ชัดเจน

Docker container start แล้วจะรัน migration ก่อนเริ่ม API ทำให้ reviewer ไม่ต้องสร้าง table ด้วยตัวเอง

## Authentication Design

โจทย์ระบุว่าไม่ให้ใช้ JWT ระบบนี้จึงใช้ server-side session

flow หลัก:

1. user register หรือ login ด้วย email/password
2. server ตรวจ password hash
3. server สร้าง session token แบบสุ่ม
4. raw token ถูกส่งกลับเป็น HttpOnly cookie
5. database เก็บเฉพาะ hash ของ token
6. request ที่ต้อง login ใช้ session guard ตรวจ cookie กับ session ที่ยัง active
7. logout จะ revoke session ปัจจุบัน
8. logout all devices จะ revoke session ทั้งหมดของ user

ข้อดี:

- ตรงกับ requirement ที่ห้ามใช้ JWT
- revoke session ได้จริงทันที
- รองรับการจดจำ device และจัดการ security ของ account
- ลดผลกระทบถ้า session table รั่ว เพราะไม่มี raw token ใน database

## Validation Strategy

ใช้ Joi validate ที่ request boundary:

- body
- query
- params

validation helper จะ:

- convert type ที่เหมาะสม เช่น `page`, `pageSize`, `month`, `year`
- strip unknown fields
- return structured validation error

แนวทางนี้ทำให้ route handler ทำงานกับข้อมูลที่ผ่าน validation แล้ว และช่วยให้ API behavior predictable

## Pagination Strategy

list endpoints ใช้ page-based pagination เพราะเหมาะกับ assignment และทดสอบง่าย

response มี:

- `items`
- `meta.page`
- `meta.pageSize`
- `meta.totalItems`
- `meta.totalPages`
- `meta.hasNextPage`
- `meta.hasPreviousPage`

รองรับ page size ตามโจทย์:

- `10`
- `20`
- `50`
- `100`

## Transaction Workflow

การสร้างหรือแก้ transaction จะตรวจ:

- account ต้องเป็นของ user และยัง active
- category ต้องเป็นของ user และยัง active
- category kind ต้องตรงกับ transaction type
- amount ต้องเป็น positive number
- occurredAt ต้องเป็น ISO date

note จะถูก normalize และผ่าน profanity masking แล้วเก็บเป็น `note_sanitized` เพื่อให้ response และ export ใช้ข้อความที่ sanitize แล้ว

## Slip Upload Design

ใช้ Fastify multipart รับไฟล์ slip

รองรับเฉพาะ:

- JPEG
- PNG
- WEBP

เหตุผลที่จำกัด MIME type เพราะ requirement ระบุว่า slip เป็นไฟล์ภาพ และช่วยลดความเสี่ยงจากการ upload ไฟล์ชนิดอื่น

ไฟล์ถูกเก็บใน local upload directory และ expose ผ่าน static route `/uploads/`

## Reporting Design

Report summary คำนวณจาก `transactions` โดยตรง ไม่สร้าง summary table แยก

เหตุผล:

- transaction table เป็น source of truth
- scope ยังไม่ใหญ่พอที่จะต้อง denormalize
- ลดความเสี่ยงยอด summary ไม่ตรงกับ transaction จริง

รองรับ group by:

- day
- month
- year

รองรับ filter:

- month
- year
- category
- account
- type
- fromDate
- toDate

summary response มีทั้ง totals และ series items

## Import / Export Design

### Export

`GET /reports/summary/export` รองรับ:

- `json`
- `csv`
- `excel`
- `googleSheet`

สำหรับ `csv` และ `googleSheet` ใช้ CSV output ส่วน `excel` ใช้ `.xlsx`

เหตุผลที่ `googleSheet` เป็น CSV-compatible คือ reviewer สามารถเปิด/import เข้า Google Sheets ได้โดยไม่ต้อง setup Google OAuth หรือ service account credential

### Import

`POST /transactions/import` รองรับ:

- `json`
- `csv`
- `excel`
- `googleSheet`

รูปแบบข้อมูลใช้ field เดียวกับ transaction create:

```text
accountId,categoryId,type,amount,occurredAt,note
```

ทุก row ถูก validate ด้วย Joi และตรวจ ownership ของ account/category ก่อนสร้าง transaction

ถ้ามีบาง row ผิด dependency เช่น category ไม่ตรง type ระบบจะ return partial result พร้อม `errors` และใช้ status `207`

## Monthly Budget And Daily Allowance

ระบบรองรับ 2 แนวคิดตาม challenge:

1. คำนวณจากเงินที่เหลืออยู่ทั้งหมด
2. คำนวณจากเงินที่ตั้ง budget ไว้ในเดือนนั้น

endpoint หลัก:

- `PUT /reports/monthly-budget`
- `GET /reports/daily-allowance`

สูตรโดยย่อ:

- remaining basis = income total - expense total
- budget basis = planned expense limit - expense total
- daily allowance = allowance base / days remaining in month

ตัวอย่าง:

ถ้า income = 500, expense = 300 และเหลือ 10 วันถึงสิ้นเดือน ระบบจะคืน daily allowance = 20.00 สำหรับ remaining basis

## Multi-language Support

ระบบมี `locale` ใน user profile และ environment default locale ผ่าน `DEFAULT_USER_LOCALE`

ปัจจุบันรองรับค่า enum:

- `th`
- `en`

ใน scope นี้ locale ถูกเตรียมไว้สำหรับ preference ของ user และ future localization ของ response/message

## Docker Design

มี Dockerfile สำหรับ build production image และ `docker-compose.yml` สำหรับ local runtime

Compose services:

- `postgres`
- `api`

API container ทำงานตามลำดับ:

1. build TypeScript
2. prune dev dependencies
3. start container
4. wait for PostgreSQL healthcheck
5. run production migration
6. start API server

แนวทางนี้ทำให้ reviewer สามารถรันระบบได้ด้วยคำสั่งเดียว:

```bash
docker compose up --build -d
```

## Testing Strategy

ใช้ Node.js built-in test runner และ Fastify inject

ครอบคลุม:

- auth
- accounts
- categories
- transactions
- transaction attachments
- reports
- report export
- transaction import
- monthly budget
- daily allowance

ข้อดีของ Fastify inject คือไม่ต้อง start server จริง และยัง test request/response flow ได้ใกล้เคียงการใช้งานจริง

สถานะล่าสุด:

- `npm run build` ผ่าน
- `npm test` ผ่าน

## Requirement Coverage Summary

Core requirements ที่ implement แล้ว:

- login
- เพิ่ม/ลบบัญชีใช้จ่าย
- เพิ่ม/ลบประเภทการใช้จ่าย
- สรุปยอดรายวัน/เดือน/ปี/ช่วงเวลา
- filter เดือน, ปี, ประเภท, บัญชี
- แนบ transaction slip เป็นไฟล์ภาพ
- note ของ transaction
- แปลงคำหยาบเป็น `***`
- pagination สำหรับ list response
- เลือก page size `10`, `20`, `50`, `100`

Challenge requirements ที่ implement แล้ว:

- README
- TypeScript
- `.env` configuration
- validate query, payload และ params
- Fastify
- TypeORM
- Joi
- export เป็น JSON, CSV, Excel และ Google Sheets-compatible CSV
- import จาก JSON, CSV, Excel และ Google Sheets-compatible CSV
- เฉลี่ยเงินที่สามารถใช้รายวันได้จนจบเดือน
- monthly budget basis
- รองรับ locale ไทย/อังกฤษใน user profile
- จดจำ device ที่ login
- logout ทุก device
- Dockerfile และ Docker Compose
- custom authentication ไม่ใช้ JWT

## Known Tradeoffs

- Google Sheets integration ทำเป็น CSV-compatible แทน direct Google Sheets API เพื่อไม่ให้ reviewer ต้อง setup external credentials
- upload storage ยังเป็น local disk เหมาะกับ assignment และ local Docker setup แต่ production ควรย้ายไป object storage
- `reports.module.ts` และ `transactions.module.ts` เริ่มมี logic หลายส่วน ถ้าโปรเจกต์โตขึ้นควรแยกเป็น service/importer/exporter เพิ่ม
- profanity dictionary ยังเป็นชุดคำพื้นฐาน สามารถขยายต่อได้
- test coverage ครอบคลุม happy path และบาง negative path สำคัญ แต่ยังเพิ่ม edge-case tests ได้อีก

## Future Improvements

- เพิ่ม service layer แยกจาก route handler สำหรับ module ที่เริ่มยาว
- เพิ่ม direct Google Sheets API เมื่อมี OAuth/service account credentials
- เพิ่ม cursor pagination สำหรับ transaction list ขนาดใหญ่มาก
- เพิ่ม object storage สำหรับ slip attachment
- เพิ่ม audit log สำหรับ security-sensitive actions
- เพิ่ม localized response messages จากค่า user locale

