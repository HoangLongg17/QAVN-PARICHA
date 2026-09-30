const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const sql = require('mssql');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const rootDir = path.resolve(__dirname, '..');
const JWT_SECRET = process.env.JWT_SECRET || 'paricha-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const useWindowsAuth = (process.env.DB_AUTH_MODE || 'sql').toLowerCase() === 'windows';
const rawWindowsUser = (process.env.DB_USER || process.env.USERNAME || '').trim();
const windowsPassword = (process.env.DB_PASSWORD || '').trim();

const windowsUserName = rawWindowsUser.includes('\\')
  ? rawWindowsUser.split('\\').slice(-1)[0]
  : rawWindowsUser;

const windowsDomain = (process.env.DB_DOMAIN || (rawWindowsUser.includes('\\') ? rawWindowsUser.split('\\')[0] : process.env.USERDOMAIN) || 'WORKGROUP').trim();

const dbConfig = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'GhepDoiQuanAn',
  port: Number(process.env.DB_PORT || 1433),
  options: {
    encrypt: String(process.env.DB_ENCRYPT || 'false').toLowerCase() === 'true',
    trustServerCertificate: true,
    enableArithAbort: true,
    trustedConnection: useWindowsAuth,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

if (useWindowsAuth && windowsUserName) {
  dbConfig.authentication = {
    type: 'ntlm',
    options: {
      domain: windowsDomain,
      userName: windowsUserName,
      password: windowsPassword,
    },
  };
}

if (!useWindowsAuth) {
  dbConfig.user = process.env.DB_USER || 'sa';
  dbConfig.password = process.env.DB_PASSWORD || 'YourStrong!Passw0rd';
}

let pool;

async function connectDatabase() {
  try {
    pool = await sql.connect(dbConfig);
    console.log('Connected to SQL Server successfully.');
    await initDatabase();
  } catch (error) {
    pool = null;
    console.error('SQL Server connection succeeded, but database initialization failed.');
    console.error('Cause:', error.message);
    console.error('This usually means the schema is already partially created or a table/constraint/index already exists.');
    console.error('Check old booking-era tables such as dbo.Bookings, dbo.DiningTables, dbo.Reports, dbo.Notifications and then run the current ticket schema script in database/database.sql once.');
  }
}

async function initDatabase() {
  try {
    const query = `
      -- Remove stale old booking-era tables and constraints from previous schema versions.
      IF OBJECT_ID(N'dbo.Reports', N'U') IS NOT NULL DROP TABLE dbo.Reports;
      IF OBJECT_ID(N'dbo.CancellationLog', N'U') IS NOT NULL DROP TABLE dbo.CancellationLog;
      IF OBJECT_ID(N'dbo.Notifications', N'U') IS NOT NULL DROP TABLE dbo.Notifications;
      IF OBJECT_ID(N'dbo.Bookings', N'U') IS NOT NULL DROP TABLE dbo.Bookings;
      IF OBJECT_ID(N'dbo.DiningTables', N'U') IS NOT NULL DROP TABLE dbo.DiningTables;

      IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Users (
          UserId INT IDENTITY(1,1) PRIMARY KEY,
          Phone NVARCHAR(20) NOT NULL UNIQUE,
          Email NVARCHAR(255) NULL,
          DateOfBirth DATE NOT NULL,
          PasswordHash NVARCHAR(255) NOT NULL DEFAULT '',
          PasswordSalt NVARCHAR(64) NOT NULL DEFAULT '',
          Gender NVARCHAR(20) NULL,
          PreferredGender NVARCHAR(20) NULL,
          PreferredAge NVARCHAR(30) NULL,
          PreferredInterest NVARCHAR(500) NULL,
          Bio NVARCHAR(500) NULL,
          Occupation NVARCHAR(100) NULL,
          FavoriteCuisine NVARCHAR(100) NULL,
          Reputation INT NOT NULL DEFAULT 100,
          LastCancelDate DATE NULL,
          CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT CK_Users_Reputation CHECK (Reputation >= 0)
        );
      END;
      ELSE
      BEGIN
        IF COL_LENGTH('dbo.Users', 'PasswordHash') IS NULL ALTER TABLE dbo.Users ADD PasswordHash NVARCHAR(255) NOT NULL DEFAULT '';
        IF COL_LENGTH('dbo.Users', 'PasswordSalt') IS NULL ALTER TABLE dbo.Users ADD PasswordSalt NVARCHAR(64) NOT NULL DEFAULT '';
        IF COL_LENGTH('dbo.Users', 'Gender') IS NULL ALTER TABLE dbo.Users ADD Gender NVARCHAR(20) NULL;
        IF COL_LENGTH('dbo.Users', 'PreferredGender') IS NULL ALTER TABLE dbo.Users ADD PreferredGender NVARCHAR(20) NULL;
        IF COL_LENGTH('dbo.Users', 'PreferredAge') IS NULL ALTER TABLE dbo.Users ADD PreferredAge NVARCHAR(30) NULL;
        IF COL_LENGTH('dbo.Users', 'PreferredInterest') IS NULL ALTER TABLE dbo.Users ADD PreferredInterest NVARCHAR(500) NULL;
        IF COL_LENGTH('dbo.Users', 'Bio') IS NULL ALTER TABLE dbo.Users ADD Bio NVARCHAR(500) NULL;
        IF COL_LENGTH('dbo.Users', 'Occupation') IS NULL ALTER TABLE dbo.Users ADD Occupation NVARCHAR(100) NULL;
        IF COL_LENGTH('dbo.Users', 'FavoriteCuisine') IS NULL ALTER TABLE dbo.Users ADD FavoriteCuisine NVARCHAR(100) NULL;
        IF COL_LENGTH('dbo.Users', 'Reputation') IS NULL ALTER TABLE dbo.Users ADD Reputation INT NOT NULL DEFAULT 100;
        IF COL_LENGTH('dbo.Users', 'IsLocked') IS NULL ALTER TABLE dbo.Users ADD IsLocked BIT NOT NULL DEFAULT 0;
        IF COL_LENGTH('dbo.Users', 'LockedAt') IS NULL ALTER TABLE dbo.Users ADD LockedAt DATETIME2 NULL;
        IF COL_LENGTH('dbo.Users', 'LastCancelDate') IS NULL ALTER TABLE dbo.Users ADD LastCancelDate DATE NULL;
      END;

      -- The current app uses the ticket-based schema from database/database.sql.
      -- This initializer intentionally removes old booking-era tables so the app can boot cleanly.
      IF OBJECT_ID(N'dbo.RestaurantTables', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.RestaurantTables (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          TableNumber INT NOT NULL UNIQUE,
          Capacity INT NOT NULL DEFAULT 2,
          Status NVARCHAR(50) NOT NULL DEFAULT N'available',
          CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
      END;

      IF OBJECT_ID(N'dbo.Tickets', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Tickets (
          Id VARCHAR(10) PRIMARY KEY,
          UserId INT NOT NULL,
          DateTime DATETIME2 NOT NULL,
          GenderReq NVARCHAR(20) NULL,
          AgeReq NVARCHAR(20) NULL,
          InterestReq NVARCHAR(500) NULL,
          Status NVARCHAR(50) NOT NULL DEFAULT N'Đang chờ',
          MatchedTicketId VARCHAR(10) NULL,
          MatchedUserId INT NULL,
          PartnerGenderReq NVARCHAR(20) NULL,
          PartnerAgeReq NVARCHAR(20) NULL,
          PartnerInterestReq NVARCHAR(500) NULL,
          DepositStatus NVARCHAR(50) NULL,
          DepositRefCode VARCHAR(50) NULL,
          TableAssigned INT NULL,
          CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT FK_Tickets_User FOREIGN KEY(UserId) REFERENCES dbo.Users(UserId),
          CONSTRAINT FK_Tickets_MatchedUser FOREIGN KEY(MatchedUserId) REFERENCES dbo.Users(UserId),
          CONSTRAINT FK_Tickets_Table FOREIGN KEY(TableAssigned) REFERENCES dbo.RestaurantTables(Id)
        );
      END;

      IF OBJECT_ID(N'dbo.AdminAccounts', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AdminAccounts (
          Id VARCHAR(10) PRIMARY KEY,
          Username NVARCHAR(50) NOT NULL UNIQUE,
          Password NVARCHAR(255) NOT NULL,
          Name NVARCHAR(100) NOT NULL,
          Role NVARCHAR(50) NOT NULL DEFAULT N'admin',
          CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
      END;

      IF OBJECT_ID(N'dbo.TicketRequests', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.TicketRequests (
          Id VARCHAR(10) PRIMARY KEY,
          Ticket1Id VARCHAR(10) NOT NULL,
          Ticket1UserId INT NOT NULL,
          Ticket2Id VARCHAR(10) NULL,
          Ticket2UserId INT NULL,
          Status NVARCHAR(50) NOT NULL DEFAULT N'Chờ duyệt',
          MatchPercentage INT NULL,
          ReasonForMatch NVARCHAR(500) NULL,
          RequestedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          ReviewedAt DATETIME2 NULL,
          ReviewedBy VARCHAR(10) NULL,
          CONSTRAINT FK_TicketRequests_Ticket1 FOREIGN KEY(Ticket1Id) REFERENCES dbo.Tickets(Id),
          CONSTRAINT FK_TicketRequests_Ticket2 FOREIGN KEY(Ticket2Id) REFERENCES dbo.Tickets(Id),
          CONSTRAINT FK_TicketRequests_User1 FOREIGN KEY(Ticket1UserId) REFERENCES dbo.Users(UserId),
          CONSTRAINT FK_TicketRequests_User2 FOREIGN KEY(Ticket2UserId) REFERENCES dbo.Users(UserId)
        );
      END;

      IF OBJECT_ID(N'dbo.Deposits', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Deposits (
          Id VARCHAR(10) PRIMARY KEY,
          TicketId VARCHAR(10) NOT NULL,
          UserId INT NOT NULL,
          Amount INT NOT NULL DEFAULT 50000,
          BankName NVARCHAR(100) NULL,
          AccountNumber VARCHAR(50) NULL,
          AccountHolder NVARCHAR(100) NULL,
          ReferenceCode VARCHAR(50) NOT NULL UNIQUE,
          Status NVARCHAR(50) NOT NULL DEFAULT N'Chờ xác nhận',
          TransactionDate DATETIME2 NULL,
          ConfirmedAt DATETIME2 NULL,
          Notes NVARCHAR(500) NULL,
          CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT FK_Deposits_Ticket FOREIGN KEY(TicketId) REFERENCES dbo.Tickets(Id),
          CONSTRAINT FK_Deposits_User FOREIGN KEY(UserId) REFERENCES dbo.Users(UserId)
        );
      END;

      IF OBJECT_ID(N'dbo.Notifications', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Notifications (
          Id VARCHAR(10) PRIMARY KEY,
          UserId INT NOT NULL,
          Type NVARCHAR(50) NOT NULL,
          Message NVARCHAR(500) NOT NULL,
          RelatedTicketId VARCHAR(10) NULL,
          IsRead BIT NOT NULL DEFAULT 0,
          CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT FK_Notifications_User FOREIGN KEY(UserId) REFERENCES dbo.Users(UserId),
          CONSTRAINT FK_Notifications_Ticket FOREIGN KEY(RelatedTicketId) REFERENCES dbo.Tickets(Id)
        );
      END;

      IF OBJECT_ID(N'dbo.TableAssignments', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.TableAssignments (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          TableId INT NOT NULL,
          Ticket1Id VARCHAR(10) NOT NULL,
          Ticket2Id VARCHAR(10) NOT NULL,
          AssignedDate DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT FK_TableAssignments_Table FOREIGN KEY(TableId) REFERENCES dbo.RestaurantTables(Id),
          CONSTRAINT FK_TableAssignments_Ticket1 FOREIGN KEY(Ticket1Id) REFERENCES dbo.Tickets(Id),
          CONSTRAINT FK_TableAssignments_Ticket2 FOREIGN KEY(Ticket2Id) REFERENCES dbo.Tickets(Id)
        );
      END;

      IF NOT EXISTS (SELECT 1 FROM dbo.RestaurantTables)
      BEGIN
        INSERT INTO dbo.RestaurantTables(TableNumber, Capacity, Status, CreatedAt, UpdatedAt)
        VALUES (1, 2, N'available', SYSUTCDATETIME(), SYSUTCDATETIME()),
               (2, 2, N'available', SYSUTCDATETIME(), SYSUTCDATETIME()),
               (3, 2, N'available', SYSUTCDATETIME(), SYSUTCDATETIME()),
               (4, 2, N'available', SYSUTCDATETIME(), SYSUTCDATETIME()),
               (5, 2, N'available', SYSUTCDATETIME(), SYSUTCDATETIME()),
               (6, 2, N'available', SYSUTCDATETIME(), SYSUTCDATETIME()),
               (7, 2, N'available', SYSUTCDATETIME(), SYSUTCDATETIME()),
               (8, 2, N'available', SYSUTCDATETIME(), SYSUTCDATETIME()),
               (9, 2, N'available', SYSUTCDATETIME(), SYSUTCDATETIME()),
               (10, 2, N'available', SYSUTCDATETIME(), SYSUTCDATETIME());
      END;

      IF NOT EXISTS (SELECT 1 FROM dbo.AdminAccounts)
      BEGIN
        INSERT INTO dbo.AdminAccounts(Id, Username, Password, Name, Role, CreatedAt)
        VALUES ('ADMIN001', 'admin', 'admin123', N'Quản trị viên', N'admin', SYSUTCDATETIME()),
               ('ADMIN002', 'admin2', 'admin456', N'Trợ lý quản trị', N'admin', SYSUTCDATETIME());
      END;
    `;

    await pool.request().query(query);
    console.log('Database schema initialized successfully.');
  } catch (error) {
    console.error('Database schema initialization failed.');
    console.error(error.message);
    throw error;
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const combined = `${salt}:${password}`;
  return {
    salt,
    hash: crypto.createHash('sha256').update(combined).digest('hex'),
  };
}

function verifyPassword(password, salt, hash) {
  if (!password || !salt || !hash) return false;
  return hashPassword(password, salt).hash === hash;
}

function isLateForReport(arrivalDate) {
  if (!arrivalDate) return false;
  const arrivalMs = new Date(arrivalDate).getTime();
  if (Number.isNaN(arrivalMs)) return false;
  return Date.now() - arrivalMs >= 30 * 60 * 1000;
}

function isValidPhone(phone) {
  const normalized = String(phone || '').replace(/\D/g, '');
  return /^0\d{9}$/.test(normalized);
}

function isValidPassword(password) {
  const value = String(password || '');
  return value.length >= 6 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function isValidEmail(email) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function isDepositPendingStatus(status) {
  if (!status) return false;
  const value = String(status).trim();
  return value === 'Ghép thành công chờ đặt cọc' || value === 'Chờ đặt cọc';
}

function formatUser(row) {
  if (!row) return null;
  const userId = row.UserId ?? row.id ?? row.userId ?? row.user_id;
  return {
    UserId: userId,
    id: userId,
    role: 'user',
    phone: row.Phone ?? row.phone,
    email: row.Email ?? row.email,
    dob: row.DateOfBirth ? new Date(row.DateOfBirth).toISOString().slice(0, 10) : row.dob,
    gender: row.Gender ?? row.gender ?? null,
    preferredGender: row.PreferredGender ?? row.preferredGender ?? null,
    preferredAge: row.PreferredAge ?? row.preferredAge ?? null,
    preferredInterest: row.PreferredInterest ?? row.preferredInterest ?? null,
    bio: row.Bio ?? row.bio ?? null,
    occupation: row.Occupation ?? row.occupation ?? null,
    favoriteCuisine: row.FavoriteCuisine ?? row.favoriteCuisine ?? null,
    reputation: row.Reputation ?? row.reputation ?? 100,
    isLocked: Boolean(row.IsLocked ?? row.isLocked ?? false),
    lockedAt: row.LockedAt ?? row.lockedAt ?? null,
    lastCancelDate: row.LastCancelDate ? new Date(row.LastCancelDate).toISOString().slice(0, 10) : row.lastCancelDate || null,
    createdAt: row.CreatedAt ?? row.createdAt,
  };
}

function formatBooking(row, viewerUserId = null) {
  if (!row) return null;

  const booking = {
    id: row.BookingId ?? row.id,
    tableId: row.TableId ?? row.tableId,
    tableName: row.TableName ?? row.table_name ?? row.name,
    userId: row.FirstUserId ?? row.userId ?? row.user_id,
    secondUserId: row.SecondUserId ?? row.secondUserId ?? row.second_user_id ?? null,
    arrival: row.FirstArrivalAt ?? row.arrival,
    entrance: row.FirstEntrance ?? row.entrance,
    secondEntrance: row.SecondEntrance ?? row.secondEntrance ?? row.second_entrance ?? null,
    status: row.Status ?? row.status,
    requirements: {
      gender: row.RequirementGender ?? row.requirement_gender ?? 'Không yêu cầu',
      age: row.RequirementAge ?? row.requirement_age ?? 'Không yêu cầu',
      interest: row.RequirementInterest ?? row.requirement_interest ?? 'Không có',
    },
    createdAt: row.CreatedAt ?? row.createdAt,
  };

  if (viewerUserId !== null) {
    booking.isMine = booking.userId === viewerUserId || booking.secondUserId === viewerUserId;
    booking.myEntrance = booking.userId === viewerUserId ? booking.entrance : booking.secondUserId === viewerUserId ? booking.secondEntrance : null;
  }

  return booking;
}

function normalizeUserId(value) {
  if (value === null || value === undefined || value === '') return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return asNumber;
  const digits = String(value).replace(/[^0-9]/g, '');
  return digits ? Number(digits) : null;
}

function signToken(user) {
  const userId = normalizeUserId(user.UserId ?? user.userId ?? user.id ?? user.user_id ?? user.Id ?? user.ID);
  return jwt.sign({ userId, phone: user.Phone ?? user.phone }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

function authenticateToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Bạn cần đăng nhập để tiếp tục.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role === 'admin') {
      req.isAdmin = true;
      req.adminUsername = decoded.username || decoded.adminUsername || null;
      req.username = decoded.username || null;
      req.userId = 0;
      return next();
    }

    const userId = normalizeUserId(decoded.userId ?? decoded.user_id);

    if (userId === null || !Number.isFinite(userId)) {
      return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
    }

    req.userId = userId;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
  }
}

function createNotification(userId, message, relatedTicketId = null, type = 'system') {
  return pool.request()
    .input('userId', sql.Int, userId)
    .input('relatedTicketId', sql.VarChar(10), relatedTicketId || null)
    .input('type', sql.NVarChar(50), type)
    .input('message', sql.NVarChar(sql.MAX), message)
    .query(`
      INSERT INTO dbo.Notifications (UserId, Type, Message, RelatedTicketId, IsRead, CreatedAt)
      VALUES (@userId, @type, @message, @relatedTicketId, 0, SYSUTCDATETIME())
    `);
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(rootDir));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/') && !pool && req.path !== '/api/health') {
    return res.status(503).json({
      error: 'Database is unavailable right now. Please check the SQL Server instance and connection settings.',
    });
  }
  return next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', name: 'PARICHA API', database: pool ? 'SQL Server connected' : 'SQL Server unavailable' });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const phone = String(req.body.phone || '').trim();
    const email = String(req.body.email || '').trim() || null;
    const dob = String(req.body.dob || '').trim();
    const password = String(req.body.password || '').trim();

    if (!phone || !dob || !password) {
      return res.status(400).json({ error: 'Số điện thoại, ngày sinh và mật khẩu là bắt buộc.' });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'Số điện thoại không hợp lệ. Ví dụ: 0912345678' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự, gồm chữ và số.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Email không hợp lệ.' });
    }

    const duplicate = await pool.request()
      .input('phone', sql.NVarChar(20), phone)
      .query('SELECT TOP 1 * FROM dbo.Users WHERE Phone = @phone');

    if (duplicate.recordset.length) {
      return res.status(409).json({ error: 'Số điện thoại đã tồn tại trên hệ thống.' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordData = hashPassword(password, salt);

    const result = await pool.request()
      .input('phone', sql.NVarChar(20), phone)
      .input('email', sql.NVarChar(255), email)
      .input('dob', sql.Date, dob)
      .input('passwordHash', sql.NVarChar(255), passwordData.hash)
      .input('passwordSalt', sql.NVarChar(64), passwordData.salt)
      .query(`
        INSERT INTO dbo.Users(Phone, Email, DateOfBirth, PasswordHash, PasswordSalt, Reputation, IsLocked, LockedAt, LastCancelDate)
        OUTPUT INSERTED.*
        VALUES (@phone, @email, @dob, @passwordHash, @passwordSalt, 100, 0, NULL, NULL)
      `);

    const user = formatUser(result.recordset[0]);
    const token = signToken(user);
    return res.status(201).json({ token, user });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Không thể đăng ký tài khoản.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const phone = String(req.body.phone || '').trim();
    const password = String(req.body.password || '').trim();
    if (!phone) {
      return res.status(400).json({ error: 'Vui lòng nhập số điện thoại.' });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'Số điện thoại không hợp lệ.' });
    }

    const result = await pool.request()
      .input('phone', sql.NVarChar(20), phone)
      .query('SELECT TOP 1 * FROM dbo.Users WHERE Phone = @phone');

    if (!result.recordset.length) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản. Hãy đăng ký trước.' });
    }

    const userRow = result.recordset[0];
    if (Number(userRow.IsLocked ?? 0) === 1) {
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa vì uy tín về 0.' });
    }

    const hasPassword = Boolean(userRow.PasswordHash && userRow.PasswordSalt);

    if (hasPassword) {
      if (!password) {
        return res.status(401).json({ error: 'Vui lòng nhập mật khẩu để đăng nhập.' });
      }

      const isValid = verifyPassword(password, userRow.PasswordSalt, userRow.PasswordHash);
      if (!isValid) {
        return res.status(401).json({ error: 'Mật khẩu không chính xác.' });
      }
    }

    const user = formatUser(userRow);
    const token = signToken(user);
    return res.json({ token, user });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Đăng nhập thất bại.' });
  }
});

app.post('/api/auth/admin-login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '').trim();

    if (!username) {
      return res.status(400).json({ error: 'Vui lòng nhập tài khoản admin.' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Vui lòng nhập mật khẩu admin.' });
    }

    const result = await pool.request()
      .input('username', sql.NVarChar(50), username)
      .query('SELECT TOP 1 * FROM dbo.AdminAccounts WHERE Username = @username');

    if (!result.recordset.length) {
      return res.status(404).json({ error: 'Tài khoản admin không tồn tại.' });
    }

    const admin = result.recordset[0];
    if (String(admin.Password || '').trim() !== String(password).trim()) {
      return res.status(401).json({ error: 'Mật khẩu admin không chính xác.' });
    }

    const user = {
      id: admin.Id,
      username: admin.Username,
      name: admin.Name,
      role: admin.Role || 'admin',
      phone: admin.Username,
      email: null,
      reputation: 100,
    };

    const token = jwt.sign({
      userId: 0,
      role: 'admin',
      adminId: admin.Id,
      username: admin.Username,
    }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.json({ token, user });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Đăng nhập admin thất bại.' });
  }
});

app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    if (req.isAdmin) {
      const adminResult = await pool.request()
        .input('username', sql.NVarChar(50), req.adminUsername || req.username || '')
        .query('SELECT TOP 1 * FROM dbo.AdminAccounts WHERE Username = @username');

      if (!adminResult.recordset.length) {
        return res.status(404).json({ error: 'Không tìm thấy tài khoản admin.' });
      }

      const admin = adminResult.recordset[0];
      return res.json({
        user: {
          id: admin.Id,
          username: admin.Username,
          name: admin.Name,
          role: admin.Role || 'admin',
          phone: admin.Username,
          email: null,
          reputation: 100,
        },
        notifications: [],
        tickets: [],
        bookings: [],
        cancellationLogs: [],
      });
    }

    const userResult = await pool.request()
      .input('userId', sql.Int, req.userId)
      .query('SELECT TOP 1 * FROM dbo.Users WHERE UserId = @userId');

    if (!userResult.recordset.length) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
    }

    const user = formatUser(userResult.recordset[0]);

    const notificationsResult = await pool.request()
      .input('userId', sql.Int, req.userId)
      .query(`
        SELECT Id AS id,
               UserId AS userId,
               Type AS type,
               Message AS message,
               RelatedTicketId AS relatedTicketId,
               IsRead AS isRead,
               CreatedAt AS createdAt
        FROM dbo.Notifications
        WHERE UserId = @userId
        ORDER BY CreatedAt DESC
      `);

    const ticketsResult = await pool.request()
      .input('userId', sql.Int, req.userId)
      .query(`
        SELECT Id AS id,
               UserId AS userId,
               DateTime AS dateTime,
               GenderReq AS preferredGender,
               AgeReq AS preferredAge,
               InterestReq AS preferredInterest,
               Status AS status,
               MatchedTicketId AS matchedTicketId,
               MatchedUserId AS matchedUserId,
               DepositStatus AS depositStatus,
               DepositRefCode AS depositReferenceCode,
               TableAssigned AS tableAssigned,
               CreatedAt AS createdAt,
               UpdatedAt AS updatedAt
        FROM dbo.Tickets
        WHERE UserId = @userId
        ORDER BY CreatedAt DESC
      `);

    return res.json({
      user,
      notifications: notificationsResult.recordset,
      tickets: ticketsResult.recordset,
      bookings: [],
      cancellationLogs: [],
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Không thể tải thông tin hồ sơ.' });
  }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    const {
      gender,
      preferredGender,
      preferredAge,
      preferredInterest,
      bio,
      occupation,
      favoriteCuisine,
    } = req.body || {};

    const updatedUser = await pool.request()
      .input('userId', sql.Int, req.userId)
      .input('gender', sql.NVarChar(20), gender || null)
      .input('preferredGender', sql.NVarChar(20), preferredGender || null)
      .input('preferredAge', sql.NVarChar(30), preferredAge || null)
      .input('preferredInterest', sql.NVarChar(500), preferredInterest || null)
      .input('bio', sql.NVarChar(500), bio || null)
      .input('occupation', sql.NVarChar(100), occupation || null)
      .input('favoriteCuisine', sql.NVarChar(100), favoriteCuisine || null)
      .query(`
        UPDATE dbo.Users
        SET Gender = @gender,
            PreferredGender = @preferredGender,
            PreferredAge = @preferredAge,
            PreferredInterest = @preferredInterest,
            Bio = @bio,
            Occupation = @occupation,
            FavoriteCuisine = @favoriteCuisine
        OUTPUT INSERTED.*
        WHERE UserId = @userId
      `);

    if (!updatedUser.recordset.length) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
    }

    return res.json({ user: formatUser(updatedUser.recordset[0]) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Không thể cập nhật hồ sơ.' });
  }
});

app.post('/api/reports', authenticateToken, async (req, res) => {
  try {
    const reporterUserId = req.userId;
    const { bookingId, reportedUserId, reason } = req.body || {};

    if (!bookingId || !reportedUserId) {
      return res.status(400).json({ error: 'Thiếu booking hoặc người bị báo cáo.' });
    }

    const bookingResult = await pool.request()
      .input('bookingId', sql.Int, Number(bookingId))
      .query(`
        SELECT b.BookingId AS id,
               b.TableId AS tableId,
               dt.TableCode AS tableName,
               b.FirstUserId AS userId,
               b.SecondUserId AS secondUserId,
               b.FirstArrivalAt AS arrival,
               b.Status AS status,
               b.FirstEntrance AS entrance,
               b.SecondEntrance AS secondEntrance
        FROM dbo.Bookings b
        INNER JOIN dbo.DiningTables dt ON dt.TableId = b.TableId
        WHERE b.BookingId = @bookingId
      `);

    if (!bookingResult.recordset.length) {
      return res.status(404).json({ error: 'Không tìm thấy đặt bàn cần báo cáo.' });
    }

    const booking = bookingResult.recordset[0];
    const isParticipant = [booking.userId, booking.secondUserId].includes(reporterUserId);
    const isTargetInBooking = [booking.userId, booking.secondUserId].includes(Number(reportedUserId));
    const isSelfReport = Number(reportedUserId) === reporterUserId;

    if (!isParticipant || !isTargetInBooking || isSelfReport) {
      return res.status(403).json({ error: 'Bạn không có quyền báo cáo người này.' });
    }

    const reportedUserIdNumber = Number(reportedUserId);
    const targetUser = await pool.request()
      .input('userId', sql.Int, reportedUserIdNumber)
      .query('SELECT TOP 1 * FROM dbo.Users WHERE UserId = @userId');

    if (!targetUser.recordset.length) {
      return res.status(404).json({ error: 'Người bị báo cáo không tồn tại.' });
    }

    if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Đặt bàn này đã kết thúc, không thể báo cáo lại.' });
    }

    if (!isLateForReport(booking.arrival)) {
      return res.status(400).json({ error: 'Chỉ có thể báo cáo khi người dùng chưa đến quá 30 phút.' });
    }

    const duplicate = await pool.request()
      .input('bookingId', sql.Int, Number(bookingId))
      .input('reporterUserId', sql.Int, reporterUserId)
      .query('SELECT TOP 1 * FROM dbo.Reports WHERE BookingId = @bookingId AND ReporterUserId = @reporterUserId');

    if (duplicate.recordset.length) {
      return res.status(409).json({ error: 'Bạn đã báo cáo booking này rồi.' });
    }

    const currentReputation = Number(targetUser.recordset[0].Reputation ?? 0);
    const newReputation = Math.max(0, currentReputation - 20);

    await pool.request()
      .input('reportedUserId', sql.Int, reportedUserIdNumber)
      .input('reputation', sql.Int, newReputation)
      .query('UPDATE dbo.Users SET Reputation = @reputation WHERE UserId = @reportedUserId');

    await pool.request()
      .input('bookingId', sql.Int, Number(bookingId))
      .input('reporterUserId', sql.Int, reporterUserId)
      .input('reportedUserId', sql.Int, reportedUserIdNumber)
      .input('reason', sql.NVarChar(500), String(reason || 'Không đến đúng giờ quá 30 phút').slice(0, 500))
      .query(`
        INSERT INTO dbo.Reports (BookingId, ReporterUserId, ReportedUserId, Reason, PenaltyPoints, ReportedAt)
        VALUES (@bookingId, @reporterUserId, @reportedUserId, @reason, 20, SYSUTCDATETIME())
      `);

    await pool.request()
      .input('bookingId', sql.Int, Number(bookingId))
      .input('cancelledBy', sql.Int, reporterUserId)
      .query(`
        UPDATE dbo.Bookings
        SET Status = 'CANCELLED',
            CancelledAt = SYSUTCDATETIME(),
            CancelledBy = @cancelledBy
        WHERE BookingId = @bookingId
      `);

    await pool.request()
      .input('userId', sql.Int, reportedUserIdNumber)
      .input('bookingId', sql.Int, Number(bookingId))
      .query(`
        INSERT INTO dbo.CancellationLog(UserId, BookingId, CancelledAt)
        VALUES (@userId, @bookingId, SYSUTCDATETIME())
      `);

    await createNotification(reportedUserIdNumber, `Bạn bị báo cáo không đến đúng giờ. Uy tín giảm 20, hiện còn ${newReputation}.`, Number(bookingId));
    await createNotification(reporterUserId, `Bạn đã báo cáo không đến đúng giờ cho bàn ${booking.tableName}. Người được báo cáo đã bị trừ 20 uy tín.`, Number(bookingId));

    const updatedUser = formatUser((await pool.request().input('userId', sql.Int, reportedUserIdNumber).query('SELECT TOP 1 * FROM dbo.Users WHERE UserId = @userId')).recordset[0]);

    return res.json({
      success: true,
      reportedUser: updatedUser,
      message: `Báo cáo thành công. ${booking.tableName} đã bị hủy và người vi phạm bị trừ 20 uy tín.`,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Không thể gửi báo cáo người dùng.' });
  }
});

app.get('/api/tables', authenticateToken, async (req, res) => {
  try {
    const result = await pool.request().query(`
      SELECT dt.TableId AS id,
             dt.TableCode AS name,
             b.BookingId AS bookingId,
             b.FirstUserId AS userId,
             b.SecondUserId AS secondUserId,
             b.FirstArrivalAt AS arrival,
             b.FirstEntrance AS entrance,
             b.SecondEntrance AS secondEntrance,
             b.Status AS status,
             b.RequirementGender AS requirementGender,
             b.RequirementAge AS requirementAge,
             b.RequirementInterest AS requirementInterest,
             b.CreatedAt AS createdAt
      FROM dbo.DiningTables dt
      LEFT JOIN dbo.Bookings b ON b.TableId = dt.TableId AND b.Status IN ('WAITING','MATCHED')
      ORDER BY dt.TableId ASC
    `);

    const tables = result.recordset.map((row) => ({
      id: row.id,
      name: row.name,
      booking: row.bookingId ? {
        id: row.bookingId,
        userId: row.userId,
        secondUserId: row.secondUserId,
        arrival: row.arrival,
        entrance: row.entrance,
        secondEntrance: row.secondEntrance,
        status: row.status,
        requirements: {
          gender: row.requirementGender || 'Không yêu cầu',
          age: row.requirementAge || 'Không yêu cầu',
          interest: row.requirementInterest || 'Không có',
        },
        createdAt: row.createdAt,
      } : null,
    }));

    return res.json({ tables });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Không thể tải danh sách bàn.' });
  }
});

app.post('/api/bookings', authenticateToken, async (req, res) => {
  try {
    const { tableId, arrival, entrance, gender, age, interest } = req.body || {};
    const userId = req.userId;

    if (!tableId || !arrival || !entrance || !['A', 'B'].includes(entrance)) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ giờ đến và chọn cửa A hoặc B.' });
    }

    const activeResult = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.Bookings
        WHERE Status IN ('WAITING','MATCHED')
          AND (FirstUserId = @userId OR SecondUserId = @userId)
      `);

    if (activeResult.recordset.length) {
      return res.status(409).json({ error: 'Bạn đã có một bàn đang hoạt động. Không thể đặt thêm.' });
    }

    const tableExists = await pool.request()
      .input('tableId', sql.Int, Number(tableId))
      .query('SELECT TOP 1 * FROM dbo.DiningTables WHERE TableId = @tableId');

    if (!tableExists.recordset.length) {
      return res.status(404).json({ error: 'Không tìm thấy bàn cần đặt.' });
    }

    const taken = await pool.request()
      .input('tableId', sql.Int, Number(tableId))
      .query(`
        SELECT TOP 1 * FROM dbo.Bookings
        WHERE TableId = @tableId AND Status IN ('WAITING','MATCHED')
      `);

    if (taken.recordset.length) {
      return res.status(409).json({ error: 'Bàn này đang có người đặt. Vui lòng chọn bàn khác.' });
    }

    const insertResult = await pool.request()
      .input('tableId', sql.Int, Number(tableId))
      .input('userId', sql.Int, userId)
      .input('arrival', sql.DateTime2, new Date(arrival))
      .input('entrance', sql.Char(1), entrance)
      .input('gender', sql.NVarChar(30), gender || null)
      .input('age', sql.NVarChar(30), age || null)
      .input('interest', sql.NVarChar(500), interest || null)
      .query(`
        INSERT INTO dbo.Bookings(TableId, FirstUserId, FirstArrivalAt, FirstEntrance, RequirementGender, RequirementAge, RequirementInterest, Status)
        OUTPUT INSERTED.*
        VALUES (@tableId, @userId, @arrival, @entrance, @gender, @age, @interest, 'WAITING')
      `);

    const newBooking = formatBooking(insertResult.recordset[0], userId);
    const tableName = tableExists.recordset[0].TableCode;
    await createNotification(userId, `Bạn đã đặt ${tableName} vào ${new Date(arrival).toLocaleString('vi-VN')}. Cửa vào của bạn: ${entrance}.`, newBooking.id);

    return res.status(201).json({ booking: newBooking });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Không thể tạo đặt bàn.' });
  }
});

app.post('/api/bookings/:id/join', authenticateToken, async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    const userId = req.userId;

    const bookingResult = await pool.request()
      .input('bookingId', sql.Int, bookingId)
      .query(`
        SELECT b.BookingId AS id,
               b.TableId AS tableId,
               dt.TableCode AS tableName,
               b.FirstUserId AS userId,
               b.SecondUserId AS secondUserId,
               b.FirstArrivalAt AS arrival,
               b.FirstEntrance AS entrance,
               b.SecondEntrance AS secondEntrance,
               b.Status AS status,
               b.RequirementGender AS requirementGender,
               b.RequirementAge AS requirementAge,
               b.RequirementInterest AS requirementInterest
        FROM dbo.Bookings b
        INNER JOIN dbo.DiningTables dt ON dt.TableId = b.TableId
        WHERE b.BookingId = @bookingId
      `);

    if (!bookingResult.recordset.length) {
      return res.status(404).json({ error: 'Bàn không tồn tại.' });
    }

    const booking = bookingResult.recordset[0];
    if (booking.userId === userId || booking.secondUserId === userId) {
      return res.status(409).json({ error: 'Bạn đang tham gia hoặc đã đặt bàn này rồi.' });
    }

    if (booking.status !== 'WAITING') {
      return res.status(409).json({ error: 'Bàn này không còn trống để tham gia.' });
    }

    const activeResult = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT TOP 1 * FROM dbo.Bookings
        WHERE Status IN ('WAITING','MATCHED')
          AND (FirstUserId = @userId OR SecondUserId = @userId)
      `);

    if (activeResult.recordset.length) {
      return res.status(409).json({ error: 'Bạn chỉ được tham gia 1 bàn trong cùng thời điểm.' });
    }

    const secondEntrance = booking.entrance === 'A' ? 'B' : 'A';

    await pool.request()
      .input('bookingId', sql.Int, bookingId)
      .input('secondUserId', sql.Int, userId)
      .input('secondEntrance', sql.Char(1), secondEntrance)
      .query(`
        UPDATE dbo.Bookings
        SET SecondUserId = @secondUserId,
            SecondEntrance = @secondEntrance,
            Status = 'MATCHED'
        WHERE BookingId = @bookingId
      `);

    const updated = await pool.request()
      .input('bookingId', sql.Int, bookingId)
      .query(`
        SELECT b.BookingId AS id,
               b.TableId AS tableId,
               dt.TableCode AS tableName,
               b.FirstUserId AS userId,
               b.SecondUserId AS secondUserId,
               b.FirstArrivalAt AS arrival,
               b.FirstEntrance AS entrance,
               b.SecondEntrance AS secondEntrance,
               b.Status AS status,
               b.RequirementGender AS requirementGender,
               b.RequirementAge AS requirementAge,
               b.RequirementInterest AS requirementInterest
        FROM dbo.Bookings b
        INNER JOIN dbo.DiningTables dt ON dt.TableId = b.TableId
        WHERE b.BookingId = @bookingId
      `);

    await createNotification(booking.userId, `Bàn ${booking.tableName} đã có người thứ hai tham gia. Người đó đi cửa ${secondEntrance}.`, bookingId);
    await createNotification(userId, `Bạn đã ghép vào ${booking.tableName}. Bạn sẽ đi cửa ${secondEntrance}. Yêu cầu của người đặt trước: ${booking.requirementGender || 'Không yêu cầu'} • ${booking.requirementAge || 'Không yêu cầu'} • ${booking.requirementInterest || 'Không có'}.`, bookingId);

    return res.json({ booking: formatBooking(updated.recordset[0], userId) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Không thể tham gia bàn.' });
  }
});

app.post('/api/bookings/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    const userId = req.userId;

    const bookingResult = await pool.request()
      .input('bookingId', sql.Int, bookingId)
      .query(`
        SELECT b.BookingId AS id,
               b.TableId AS tableId,
               dt.TableCode AS tableName,
               b.FirstUserId AS userId,
               b.SecondUserId AS secondUserId,
               b.FirstArrivalAt AS arrival,
               b.FirstEntrance AS entrance,
               b.SecondEntrance AS secondEntrance,
               b.Status AS status
        FROM dbo.Bookings b
        INNER JOIN dbo.DiningTables dt ON dt.TableId = b.TableId
        WHERE b.BookingId = @bookingId
      `);

    if (!bookingResult.recordset.length) {
      return res.status(404).json({ error: 'Không tìm thấy bàn đặt.' });
    }

    const booking = bookingResult.recordset[0];
    if (booking.userId !== userId && booking.secondUserId !== userId) {
      return res.status(403).json({ error: 'Bạn không thuộc bàn này.' });
    }

    const todayCancelCount = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT COUNT(*) AS total
        FROM dbo.CancellationLog
        WHERE UserId = @userId AND CAST(CancelledAt AS date) = CAST(GETDATE() AS date)
      `);

    if (Number(todayCancelCount.recordset[0].total) >= 1) {
      return res.status(400).json({ error: 'Bạn đã hủy 1 lượt hôm nay. Chỉ được hủy tối đa 1 lần/ngày.' });
    }

    const userResult = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT TOP 1 * FROM dbo.Users WHERE UserId = @userId');

    const user = formatUser(userResult.recordset[0]);
    const newReputation = Math.max(0, Number(user.reputation) - 5);

    await pool.request()
      .input('userId', sql.Int, userId)
      .input('reputation', sql.Int, newReputation)
      .input('cancelDate', sql.Date, new Date())
      .query(`
        UPDATE dbo.Users
        SET Reputation = @reputation,
            LastCancelDate = @cancelDate
        WHERE UserId = @userId
      `);

    await pool.request()
      .input('bookingId', sql.Int, bookingId)
      .input('userId', sql.Int, userId)
      .query(`
        UPDATE dbo.Bookings
        SET Status = 'CANCELLED',
            CancelledAt = SYSUTCDATETIME(),
            CancelledBy = @userId
        WHERE BookingId = @bookingId
      `);

    await pool.request()
      .input('userId', sql.Int, userId)
      .input('bookingId', sql.Int, bookingId)
      .query(`
        INSERT INTO dbo.CancellationLog(UserId, BookingId, CancelledAt)
        VALUES (@userId, @bookingId, SYSUTCDATETIME())
      `);

    if (booking.userId === userId && booking.secondUserId) {
      await createNotification(booking.secondUserId, `Bàn ${booking.tableName} đã bị hủy bởi người đặt trước.`, bookingId);
    }

    if (booking.secondUserId === userId) {
      await createNotification(booking.userId, `Bàn ${booking.tableName} đã bị hủy bởi người ghép sau.`, bookingId);
    }

    const updatedUser = formatUser((await pool.request().input('userId', sql.Int, userId).query('SELECT TOP 1 * FROM dbo.Users WHERE UserId = @userId')).recordset[0]);
    return res.json({
      success: true,
      user: updatedUser,
      message: `Hủy đặt bàn thành công. Uy tín của bạn hiện còn ${updatedUser.reputation}.`,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Không thể hủy bàn.' });
  }
});

app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const result = await pool.request()
      .input('userId', sql.Int, req.userId)
      .query(`
        SELECT Id AS id,
               UserId AS userId,
               Type AS type,
               Message AS message,
               RelatedTicketId AS relatedTicketId,
               IsRead AS isRead,
               CreatedAt AS createdAt
        FROM dbo.Notifications
        WHERE UserId = @userId
        ORDER BY CreatedAt DESC
      `);
    return res.json({ notifications: result.recordset });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Không thể lấy thông báo.' });
  }
});

app.get('/api/tickets', authenticateToken, async (req, res) => {
  try {
    const result = await pool.request()
      .input('userId', sql.Int, req.userId)
      .query(`
        SELECT Id AS id,
               UserId AS userId,
               DateTime AS dateTime,
               GenderReq AS preferredGender,
               AgeReq AS preferredAge,
               InterestReq AS preferredInterest,
               Status AS status,
               MatchedTicketId AS matchedTicketId,
               MatchedUserId AS matchedUserId,
               DepositStatus AS depositStatus,
               DepositRefCode AS depositReferenceCode,
               TableAssigned AS tableAssigned,
               CreatedAt AS createdAt,
               UpdatedAt AS updatedAt
        FROM dbo.Tickets
        WHERE UserId = @userId
        ORDER BY CreatedAt DESC
      `);

    return res.json({ tickets: result.recordset });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Không thể tải danh sách phiếu.' });
  }
});

app.post('/api/tickets', authenticateToken, async (req, res) => {
  try {
    const { dateTime, preferredGender, preferredAge, preferredInterest } = req.body || {};

    if (!dateTime) {
      return res.status(400).json({ error: 'Vui lòng chọn ngày giờ đặt phiếu.' });
    }

    const chosenDate = new Date(dateTime);
    if (Number.isNaN(chosenDate.getTime()) || chosenDate <= new Date()) {
      return res.status(400).json({ error: 'Thời gian đặt phiếu phải ở tương lai.' });
    }

    const userResult = await pool.request()
      .input('userId', sql.Int, req.userId)
      .query('SELECT TOP 1 * FROM dbo.Users WHERE UserId = @userId');

    if (!userResult.recordset.length) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
    }

    if (Number(userResult.recordset[0].IsLocked ?? 0) === 1) {
      return res.status(403).json({ error: 'Tài khoản đã bị khóa do uy tín về 0.' });
    }

    const lastTicket = await pool.request().query(`
      SELECT TOP 1 Id
      FROM dbo.Tickets
      ORDER BY CAST(SUBSTRING(Id, 2, LEN(Id) - 1) AS INT) DESC
    `);

    let nextNumber = 1;
    if (lastTicket.recordset.length && lastTicket.recordset[0].Id) {
      const match = String(lastTicket.recordset[0].Id).match(/(\d+)/);
      nextNumber = match ? Number(match[1]) + 1 : 1;
    }

    const ticketId = `T${String(nextNumber).padStart(3, '0')}`;

    const insertResult = await pool.request()
      .input('id', sql.VarChar(10), ticketId)
      .input('userId', sql.Int, req.userId)
      .input('dateTime', sql.DateTime2, new Date(dateTime))
      .input('genderReq', sql.NVarChar(20), preferredGender || null)
      .input('ageReq', sql.NVarChar(20), preferredAge || null)
      .input('interestReq', sql.NVarChar(500), preferredInterest || null)
      .query(`
        INSERT INTO dbo.Tickets (Id, UserId, DateTime, GenderReq, AgeReq, InterestReq, Status, CreatedAt, UpdatedAt)
        OUTPUT INSERTED.*
        VALUES (@id, @userId, @dateTime, @genderReq, @ageReq, @interestReq, N'Đang chờ', SYSUTCDATETIME(), SYSUTCDATETIME())
      `);

    const ticket = insertResult.recordset[0];
    return res.status(201).json({ ticket: {
      id: ticket.Id,
      userId: ticket.UserId,
      dateTime: ticket.DateTime,
      preferredGender: ticket.GenderReq,
      preferredAge: ticket.AgeReq,
      preferredInterest: ticket.InterestReq,
      status: ticket.Status,
      depositStatus: ticket.DepositStatus,
      depositReferenceCode: ticket.DepositRefCode,
      createdAt: ticket.CreatedAt,
    }});
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Không thể tạo phiếu đặt.' });
  }
});

app.post('/api/tickets/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const ticketId = String(req.params.id || '').trim();
    const result = await pool.request()
      .input('ticketId', sql.VarChar(10), ticketId)
      .input('userId', sql.Int, req.userId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.Tickets
        WHERE Id = @ticketId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ error: 'Không tìm thấy phiếu.' });
    }

    const ticket = result.recordset[0];
    if (Number(ticket.UserId) !== Number(req.userId)) {
      return res.status(403).json({ error: 'Bạn không có quyền hủy phiếu này.' });
    }

    const pendingDepositPenalty = isDepositPendingStatus(ticket.Status);
    const userRow = (await pool.request()
      .input('userId', sql.Int, req.userId)
      .query('SELECT TOP 1 * FROM dbo.Users WHERE UserId = @userId')).recordset[0];

    let reputation = Number(userRow.Reputation ?? 100);
    let isLocked = Number(userRow.IsLocked ?? 0) === 1;

    if (pendingDepositPenalty) {
      reputation = Math.max(0, reputation - 20);
      isLocked = reputation === 0;

      await pool.request()
        .input('userId', sql.Int, req.userId)
        .input('reputation', sql.Int, reputation)
        .input('isLocked', sql.Bit, isLocked)
        .input('lockedAt', sql.DateTime2, isLocked ? new Date() : null)
        .query(`
          UPDATE dbo.Users
          SET Reputation = @reputation,
              IsLocked = @isLocked,
              LockedAt = @lockedAt
          WHERE UserId = @userId
        `);
    }

    await pool.request()
      .input('ticketId', sql.VarChar(10), ticketId)
      .query(`
        UPDATE dbo.Tickets
        SET Status = N'Hủy', UpdatedAt = SYSUTCDATETIME()
        WHERE Id = @ticketId
      `);

    if (pendingDepositPenalty) {
      const message = isLocked
        ? 'Bạn đã tự hủy phiếu đang chờ đặt cọc. Uy tín giảm 20 điểm và tài khoản đã bị khóa.'
        : 'Bạn đã tự hủy phiếu đang chờ đặt cọc. Uy tín giảm 20 điểm.';
      return res.json({ message, reputation, isLocked });
    }

    return res.json({ message: 'Hủy phiếu thành công.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Không thể hủy phiếu.' });
  }
});

app.post('/api/tickets/:id/deposit', authenticateToken, async (req, res) => {
  try {
    const ticketId = String(req.params.id || '').trim();
    const ticketResult = await pool.request()
      .input('ticketId', sql.VarChar(10), ticketId)
      .input('userId', sql.Int, req.userId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.Tickets
        WHERE Id = @ticketId AND UserId = @userId
      `);

    if (!ticketResult.recordset.length) {
      return res.status(404).json({ error: 'Không tìm thấy phiếu của bạn.' });
    }

    const ticket = ticketResult.recordset[0];
    if ((ticket.Status || '').trim() !== 'Ghép thành công chờ đặt cọc') {
      return res.status(400).json({ error: 'Phiếu này chưa ở trạng thái cần đặt cọc.' });
    }

    const referenceCode = `PARICHA-${ticketId}-${Date.now()}`;
    await pool.request()
      .input('id', sql.VarChar(10), `D${String(Date.now()).slice(-6)}`)
      .input('ticketId', sql.VarChar(10), ticketId)
      .input('userId', sql.Int, req.userId)
      .input('referenceCode', sql.VarChar(50), referenceCode)
      .query(`
        INSERT INTO dbo.Deposits (Id, TicketId, UserId, Amount, ReferenceCode, Status, CreatedAt)
        VALUES (@id, @ticketId, @userId, 50000, @referenceCode, N'Đã xác nhận', SYSUTCDATETIME())
      `);

    await pool.request()
      .input('ticketId', sql.VarChar(10), ticketId)
      .input('referenceCode', sql.VarChar(50), referenceCode)
      .query(`
        UPDATE dbo.Tickets
        SET Status = N'Đặt cọc thành công', DepositStatus = N'Đã cọc', DepositRefCode = @referenceCode, UpdatedAt = SYSUTCDATETIME()
        WHERE Id = @ticketId
      `);

    return res.json({ message: 'Đặt cọc thành công.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Không thể đặt cọc.' });
  }
});

function calculateTicketCompatibility(ticketA, ticketB) {
  const normalize = (value) => String(value || '').trim().toLowerCase();
  const normalizeList = (value) => String(value || '')
    .toLowerCase()
    .replace(/\s*;\s*/g, ';')
    .split(/[;,+\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const normalizeAlias = (value) => {
    const normalized = normalize(value);
    const aliases = {
      'hoà đồng': 'hòa đồng',
      'hoa dong': 'hòa đồng',
      'hòa đồng': 'hòa đồng',
      'tĩnh lặng': 'tĩnh lặng',
      'tinh lang': 'tĩnh lặng',
      'năng động': 'năng động',
      'nang dong': 'năng động',
      'lịch sự': 'lịch sự',
      'lich su': 'lịch sự',
      'nhiệt tình': 'nhiệt tình',
      'nhiet tinh': 'nhiệt tình',
      'vui vẻ': 'vui vẻ',
      'vui ve': 'vui vẻ',
      'du lịch': 'du lịch',
      'dulich': 'du lịch',
      'ẩm thực': 'ẩm thực',
      'am thuc': 'ẩm thực',
      'âm nhạc': 'âm nhạc',
      'am nhac': 'âm nhạc',
      'phim': 'phim',
      'thể thao': 'thể thao',
      'the thao': 'thể thao',
      'đọc sách': 'đọc sách',
      'doc sach': 'đọc sách',
      'nấu ăn': 'nấu ăn',
      'nau an': 'nấu ăn',
      'café / trò chuyện': 'café / trò chuyện',
      'cafe / tro chuyen': 'café / trò chuyện',
      'cafe': 'café / trò chuyện',
      'tro chuyen': 'café / trò chuyện',
    };

    return aliases[normalized] || normalized;
  };

  const preferenceTagsA = normalizeList(ticketA.preferredInterest).map(normalizeAlias);
  const preferenceTagsB = normalizeList(ticketB.preferredInterest).map(normalizeAlias);

  const personalityKeywords = new Set([
    'hòa đồng', 'tĩnh lặng', 'năng động', 'lịch sự', 'nhiệt tình', 'vui vẻ',
  ]);

  const personalityA = preferenceTagsA.filter((tag) => personalityKeywords.has(tag));
  const personalityB = preferenceTagsB.filter((tag) => personalityKeywords.has(tag));
  const interestA = preferenceTagsA.filter((tag) => !personalityKeywords.has(tag));
  const interestB = preferenceTagsB.filter((tag) => !personalityKeywords.has(tag));

  let score = 0;
  const reasons = [];

  const genderA = normalize(ticketA.preferredGender);
  const genderB = normalize(ticketB.preferredGender);
  if (!genderA || !genderB) {
    score += 12;
    reasons.push('Một phiếu chưa đặt giới tính mong muốn');
  } else if (genderA === genderB) {
    score += 30;
    reasons.push('Giới tính mong muốn phù hợp');
  } else {
    score -= 15;
    reasons.push('Giới tính mong muốn khác nhau');
  }

  const ageA = normalize(ticketA.preferredAge);
  const ageB = normalize(ticketB.preferredAge);
  if (!ageA || !ageB) {
    score += 8;
    reasons.push('Một phiếu chưa đặt độ tuổi mong muốn');
  } else if (ageA === ageB) {
    score += 20;
    reasons.push('Độ tuổi tương đồng');
  } else {
    score -= 10;
    reasons.push('Độ tuổi không khớp');
  }

  if (!personalityA.length && !personalityB.length) {
    score += 8;
    reasons.push('Chưa có dữ liệu tính cách rõ ràng');
  } else {
    const personalityOverlap = personalityA.filter((tag) => personalityB.includes(tag));
    if (personalityOverlap.length) {
      score += Math.min(22, personalityOverlap.length * 11);
      reasons.push(`Tính cách chung: ${personalityOverlap.slice(0, 3).join(', ')}`);
    } else if (personalityA.length && personalityB.length) {
      score -= 8;
      reasons.push('Tính cách không tương đồng');
    } else {
      score += 6;
      reasons.push('Một phiếu chưa có tính cách rõ ràng');
    }
  }

  if (!interestA.length || !interestB.length) {
    score += 10;
    reasons.push('Một trong hai phiếu chưa có sở thích rõ ràng');
  } else {
    const overlap = interestA.filter((tag) => interestB.includes(tag));
    if (overlap.length) {
      score += Math.min(28, overlap.length * 12);
      reasons.push(`Sở thích chung: ${overlap.slice(0, 3).join(', ')}`);
    } else {
      score -= 8;
      reasons.push('Không có sở thích chung đáng kể');
    }
  }

  const overallScore = Math.max(0, Math.min(100, score + 12));

  return {
    score: overallScore,
    reason: reasons.length ? reasons.join('; ') : 'Cùng nhu cầu chung',
  };
}

app.get('/api/admin/overview', authenticateToken, async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Chỉ admin mới được xem dashboard.' });
    }

    const ticketsResult = await pool.request().query(`
      SELECT Id AS id,
             UserId AS userId,
             DateTime AS dateTime,
             GenderReq AS preferredGender,
             AgeReq AS preferredAge,
             InterestReq AS preferredInterest,
             Status AS status,
             MatchedTicketId AS matchedTicketId,
             MatchedUserId AS matchedUserId,
             DepositStatus AS depositStatus,
             DepositRefCode AS depositReferenceCode,
             TableAssigned AS tableAssigned,
             CreatedAt AS createdAt,
             UpdatedAt AS updatedAt
      FROM dbo.Tickets
      ORDER BY CreatedAt DESC
    `);

    const tickets = ticketsResult.recordset || [];
    const suggestions = [];
    const matchedPairs = [];
    const seenMatchPairs = new Set();

    for (const ticket of tickets) {
      const status = String(ticket.status || '').trim();
      const matchedTicketId = ticket.matchedTicketId || null;

      if ((status === 'Ghép thành công chờ đặt cọc' || status === 'Đặt cọc thành công') && matchedTicketId) {
        const pairKey = [String(ticket.id), String(matchedTicketId)].sort().join('|');
        if (!seenMatchPairs.has(pairKey)) {
          seenMatchPairs.add(pairKey);
          matchedPairs.push({
            ticket1Id: String(ticket.id),
            ticket2Id: String(matchedTicketId),
            status1: status,
            status2: String((tickets.find((item) => String(item.id) === String(matchedTicketId))?.status || 'Đã ghép')).trim(),
            matchedAt: ticket.updatedAt || ticket.createdAt || null,
          });
        }
      }
    }

    for (let i = 0; i < tickets.length; i += 1) {
      for (let j = i + 1; j < tickets.length; j += 1) {
        const ticketA = tickets[i];
        const ticketB = tickets[j];

        const statusA = String(ticketA.status || '').trim();
        const statusB = String(ticketB.status || '').trim();

        if (statusA === 'Hủy' || statusB === 'Hủy') continue;
        if (statusA === 'Ghép thành công chờ đặt cọc' || statusB === 'Ghép thành công chờ đặt cọc') continue;
        if (statusA === 'Đặt cọc thành công' || statusB === 'Đặt cọc thành công') continue;
        if (ticketA.userId === ticketB.userId) continue;

        const compatibility = calculateTicketCompatibility(ticketA, ticketB);
        if (compatibility.score >= 50) {
          suggestions.push({
            ticket1Id: ticketA.id,
            ticket2Id: ticketB.id,
            score: compatibility.score,
            reason: compatibility.reason,
          });
        }
      }
    }

    suggestions.sort((a, b) => b.score - a.score);

    return res.json({ tickets, suggestions: suggestions.slice(0, 10), matchedPairs });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Không thể tải dashboard admin.' });
  }
});

app.post('/api/admin/match', authenticateToken, async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Chỉ admin mới có quyền duyệt ghép.' });
    }

    const { ticket1Id, ticket2Id } = req.body || {};
    if (!ticket1Id || !ticket2Id) {
      return res.status(400).json({ error: 'Thiếu thông tin 2 phiếu cần ghép.' });
    }

    const ticketResult = await pool.request()
      .input('ticket1Id', sql.VarChar(10), ticket1Id)
      .input('ticket2Id', sql.VarChar(10), ticket2Id)
      .query(`
        SELECT * FROM dbo.Tickets
        WHERE Id IN (@ticket1Id, @ticket2Id)
      `);

    if (ticketResult.recordset.length !== 2) {
      return res.status(404).json({ error: 'Một trong 2 phiếu không tồn tại.' });
    }

    const t1 = ticketResult.recordset.find((item) => item.Id === ticket1Id);
    const t2 = ticketResult.recordset.find((item) => item.Id === ticket2Id);

    if (!t1 || !t2) {
      return res.status(400).json({ error: 'Phiếu không hợp lệ.' });
    }

    if (t1.UserId === t2.UserId) {
      return res.status(400).json({ error: 'Không thể ghép phiếu của cùng một người.' });
    }

    const t1Status = String(t1.Status || '').trim();
    const t2Status = String(t2.Status || '').trim();
    if (t1Status === 'Hủy' || t2Status === 'Hủy') {
      return res.status(400).json({ error: 'Phiếu đã bị hủy, không được ghép lại nữa.' });
    }
    if (t1Status === 'Ghép thành công chờ đặt cọc' || t2Status === 'Ghép thành công chờ đặt cọc') {
      return res.status(400).json({ error: 'Một trong 2 phiếu đã ghép thành công, không được ghép lại nữa.' });
    }
    if (t1Status === 'Đặt cọc thành công' || t2Status === 'Đặt cọc thành công') {
      return res.status(400).json({ error: 'Một trong 2 phiếu đã hoàn tất đặt cọc, không được ghép lại nữa.' });
    }
    if (t1.MatchedTicketId || t2.MatchedTicketId) {
      return res.status(400).json({ error: 'Một trong 2 phiếu đã có cặp ghép đang hoạt động.' });
    }

    await pool.request()
      .input('ticket1Id', sql.VarChar(10), ticket1Id)
      .input('ticket2Id', sql.VarChar(10), ticket2Id)
      .query(`
        UPDATE dbo.Tickets
        SET Status = N'Ghép thành công chờ đặt cọc',
            MatchedTicketId = @ticket2Id,
            MatchedUserId = (CASE WHEN Id = @ticket1Id THEN (SELECT UserId FROM dbo.Tickets WHERE Id = @ticket2Id) ELSE (SELECT UserId FROM dbo.Tickets WHERE Id = @ticket1Id) END),
            UpdatedAt = SYSUTCDATETIME()
        WHERE Id IN (@ticket1Id, @ticket2Id)
      `);

    await pool.request()
      .input('ticket1Id', sql.VarChar(10), ticket1Id)
      .input('ticket2Id', sql.VarChar(10), ticket2Id)
      .query(`
        INSERT INTO dbo.TicketRequests (Id, Ticket1Id, Ticket1UserId, Ticket2Id, Ticket2UserId, Status, MatchPercentage, ReasonForMatch, RequestedAt, ReviewedAt, ReviewedBy)
        VALUES (
          'TR' + CAST((SELECT ISNULL(MAX(CAST(SUBSTRING(Id, 3, LEN(Id)-2) AS INT)),0)+1 FROM dbo.TicketRequests) AS VARCHAR(10)),
          @ticket1Id,
          (SELECT UserId FROM dbo.Tickets WHERE Id = @ticket1Id),
          @ticket2Id,
          (SELECT UserId FROM dbo.Tickets WHERE Id = @ticket2Id),
          N'Chấp thuận',
          90,
          N'Admin duyệt ghép dựa trên tiêu chí phù hợp chung.',
          SYSUTCDATETIME(),
          SYSUTCDATETIME(),
          'ADMIN001'
        )
      `);

    return res.json({ message: 'Duyệt ghép thành công. Hai phiếu đã chuyển sang trạng thái ghép thành công chờ đặt cọc.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Không thể duyệt ghép.' });
  }
});

app.get('/api/history', authenticateToken, async (req, res) => {
  try {
    const bookingResult = await pool.request()
      .input('userId', sql.Int, req.userId)
      .query(`
        SELECT b.BookingId AS id,
               dt.TableCode AS tableName,
               b.FirstArrivalAt AS arrival,
               b.FirstEntrance AS entrance,
               b.SecondEntrance AS secondEntrance,
               b.Status AS status,
               b.FirstUserId AS userId,
               b.SecondUserId AS secondUserId,
               b.CreatedAt AS createdAt
        FROM dbo.Bookings b
        INNER JOIN dbo.DiningTables dt ON dt.TableId = b.TableId
        WHERE b.FirstUserId = @userId OR b.SecondUserId = @userId
        ORDER BY b.CreatedAt DESC
      `);

    const cancellationResult = await pool.request()
      .input('userId', sql.Int, req.userId)
      .query(`
        SELECT cl.CancellationId AS id,
               dt.TableCode AS tableName,
               cl.CancelledAt AS cancelledAt
        FROM dbo.CancellationLog cl
        INNER JOIN dbo.Bookings b ON b.BookingId = cl.BookingId
        INNER JOIN dbo.DiningTables dt ON dt.TableId = b.TableId
        WHERE cl.UserId = @userId
        ORDER BY cl.CancelledAt DESC
      `);

    return res.json({ bookings: bookingResult.recordset, cancellations: cancellationResult.recordset });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Không thể tải lịch sử đặt bàn.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

connectDatabase();

app.listen(PORT, () => {
  console.log(`PARICHA server is running on http://localhost:${PORT}`);
});
