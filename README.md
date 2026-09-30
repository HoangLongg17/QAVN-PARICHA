# PARICHA - Quán ăn ghép đôi

Dự án web demo cho hệ thống quán ăn ghép đôi, cho phép khách hàng đăng ký, đặt phiếu, xem thông báo, cập nhật hồ sơ và quản lý ghép đôi giữa các khách. Dự án bao gồm:

- Frontend: HTML + CSS + JavaScript
- Backend: Node.js + Express
- Database: Microsoft SQL Server

## Yêu cầu hệ thống

Trước khi chạy dự án, bạn cần cài đặt:

- Git
- Node.js 18+ hoặc 20+
- npm
- SQL Server 2019/2022 (LocalDB hoặc Developer Edition đều được)
- SQL Server Management Studio (SSMS) hoặc sqlcmd nếu cần chạy script bằng command line

## 1. Clone project

```bash
git clone <link-repo-cua-ban>
cd QuanAnVachNgan
```

Ví dụ nếu bạn đang ở thư mục đã có source:

```bash
cd d:/QuanAnVachNgan
```

## 2. Tạo database SQL Server

Mở SQL Server Management Studio hoặc dùng sqlcmd, sau đó chạy file script sau:

- [database/database.sql](database/database.sql)

Script này sẽ:

- tạo database `GhepDoiQuanAn`
- tạo toàn bộ bảng cần thiết
- chèn dữ liệu mẫu
- tạo tài khoản admin mặc định

Nếu bạn dùng SQL Server local trên máy cá nhân, thường sẽ connect bằng:

- Server name: `localhost`
- Authentication: Windows Authentication hoặc SQL Server Authentication

## 3. Cấu hình file .env cho backend

Vào thư mục backend, tạo hoặc chỉnh sửa file `.env` như sau:

```env
PORT=3000
JWT_SECRET=paricha-secret-key
JWT_EXPIRES_IN=7d

DB_AUTH_MODE=windows
DB_SERVER=localhost
DB_DOMAIN=YOUR_WINDOWS_DOMAIN
DB_PORT=1433
DB_NAME=GhepDoiQuanAn
DB_USER=YOUR_WINDOWS_USERNAME
DB_PASSWORD=YOUR_WINDOWS_PASSWORD
DB_ENCRYPT=false
```

Ghi chú:

- Nếu bạn dùng Windows Authentication thì cần điền đúng `DB_DOMAIN`, `DB_USER`, `DB_PASSWORD`.
- Nếu bạn dùng SQL Server Authentication thì hãy đổi:

```env
DB_AUTH_MODE=sql
DB_USER=sa
DB_PASSWORD=YourStrong!Passw0rd
```

> File `.env` mẫu đang có sẵn trong dự án, nhưng nếu repo clone về mà không có, hãy tạo lại theo mẫu trên.

## 4. Cài đặt dependency backend

Trong thư mục project:

```bash
cd backend
npm install
```

Nếu bạn muốn chạy ở chế độ dev:

```bash
npm run dev
```

Nếu chạy production:

```bash
npm start
```

## 5. Chạy ứng dụng

Sau khi backend đã khởi động thành công, mở trình duyệt:

```text
http://localhost:3000
```

Vì backend đang phục vụ file tĩnh từ thư mục gốc của project, nên mở địa chỉ trên sẽ load được giao diện web chính.

## 6. Tài khoản admin mặc định

Sau khi database được tạo, hệ thống sẽ có tài khoản admin mặc định:

- Username: `admin`
- Password: `admin123`

## 7. Cấu trúc thư mục chính

```text
QuanAnVachNgan/
├─ index.html
├─ css/
│  └─ style.css
├─ js/
│  └─ app.js
├─ assets/
│  └─ images/
├─ backend/
│  ├─ .env
│  ├─ package.json
│  └─ server.js
├─ database/
│  └─ database.sql
├─ README.md
└─ .gitignore
```

## 8. Troubleshooting

### Không kết nối được SQL Server

- Kiểm tra SQL Server đang chạy
- Kiểm tra port `1433`
- Kiểm tra tên server đúng: `localhost`
- Kiểm tra username/password hoặc Windows account
- Nếu dùng Windows auth, đảm bảo `DB_DOMAIN` và `DB_USER` đúng

### Lỗi `Database is unavailable right now`

- Kiểm tra database `GhepDoiQuanAn` đã tạo chưa
- Kiểm tra `.env` đúng đúng với máy bạn
- Chạy lại script SQL trong [database/database.sql](database/database.sql)

### Mở trang web nhưng API không hoạt động

- Kiểm tra backend đã chạy trên cổng 3000 chưa
- Kiểm tra terminal có lỗi gì khi chạy `npm start`
- Kiểm tra route `/api/health` bằng cách truy cập:

```text
http://localhost:3000/api/health
```

Nếu trả về JSON trạng thái `ok`, nghĩa là backend đang hoạt động bình thường.

## 9. Lưu ý khi phát triển

- Không commit file `.env` lên repo nếu project đang dùng môi trường thật.
- Nếu muốn deploy lên server thật, cần thay đổi `JWT_SECRET`, database credentials và cấu hình bảo mật.
- Dự án này là demo, nên tốt nhất nên bổ sung thêm:
  - validation đầu vào rõ ràng hơn
  - xác thực người dùng tốt hơn
  - logging và monitoring
  - kiểm soát session / token hợp lý

## 10. Chạy nhanh nhất

Nếu bạn muốn chạy ngay trong 5 bước:

```bash
git clone <repo-url>
cd QuanAnVachNgan
sqlcmd -S localhost -E -i database/database.sql
cd backend
npm install
npm start
```

Sau đó mở:

```text
http://localhost:3000
```

---

Nếu bạn muốn, mình có thể viết tiếp cho bạn một phiên bản README chuyên nghiệp hơn theo phong cách GitHub chuẩn, kèm ảnh chụp, mục “Demo credentials”, “Features”, “Tech stack”, và “Run locally” theo kiểu project showcase.
