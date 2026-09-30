USE master;
GO

IF DB_ID('GhepDoiQuanAn') IS NOT NULL
BEGIN
    ALTER DATABASE GhepDoiQuanAn SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE GhepDoiQuanAn;
END
GO

CREATE DATABASE GhepDoiQuanAn;
GO

USE GhepDoiQuanAn;
GO

CREATE TABLE dbo.Users (
    UserId INT IDENTITY(1,1) PRIMARY KEY,
    Phone NVARCHAR(20) NOT NULL UNIQUE,
    Email NVARCHAR(255) NULL,
    DateOfBirth DATE NOT NULL,
    PasswordHash NVARCHAR(255) NOT NULL DEFAULT '',
    PasswordSalt NVARCHAR(64) NOT NULL DEFAULT '',
    Name NVARCHAR(100) NULL,
    Gender NVARCHAR(20) NULL,
    PreferredGender NVARCHAR(20) NULL,
    PreferredAge NVARCHAR(30) NULL,
    PreferredInterest NVARCHAR(500) NULL,
    Bio NVARCHAR(500) NULL,
    Occupation NVARCHAR(100) NULL,
    FavoriteCuisine NVARCHAR(100) NULL,
    Reputation INT NOT NULL DEFAULT 100,
    IsLocked BIT NOT NULL DEFAULT 0,
    LockedAt DATETIME2 NULL,
    LastCancelDate DATE NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Users_Reputation CHECK (Reputation >= 0)
);
GO

INSERT INTO dbo.Users (
    Phone, Email, DateOfBirth, PasswordHash, PasswordSalt,
    Name, Gender, PreferredGender, PreferredAge, PreferredInterest,
    Bio, Occupation, FavoriteCuisine, Reputation, IsLocked, LockedAt,
    LastCancelDate, CreatedAt, UpdatedAt
)
VALUES
    ('0912345678', 'nguyenvana@gmail.com', '1998-05-15', 'b18492ba01b9cf5be83497b35c8f5be235802525c3f7d18af8fcf72a59bb9605', 'demo-salt', N'Nguyễn Văn A', N'Nam', N'Nữ', N'18-25', N'Thích trò chuyện, âm nhạc, du lịch', N'Hiền lành, dễ gần', N'Kỹ sư', N'Miền Nam', 100, 0, NULL, NULL, '2024-01-15', '2024-01-15'),
    ('0987654321', 'tranthib@gmail.com', '2000-08-20', 'b18492ba01b9cf5be83497b35c8f5be235802525c3f7d18af8fcf72a59bb9605', 'demo-salt', N'Trần Thị B', N'Nữ', N'Nam', N'18-25', N'Yêu thích ẩm thực, yoga, đọc sách', N'Thân thiện, vui vẻ', N'Design', N'Việt Nam', 95, 0, NULL, NULL, '2024-02-10', '2024-02-10'),
    ('0901234567', 'leminhc@gmail.com', '1999-03-10', 'b18492ba01b9cf5be83497b35c8f5be235802525c3f7d18af8fcf72a59bb9605', 'demo-salt', N'Lê Minh C', N'Nam', N'Nữ', N'26-35', N'Thích công nghệ, phim, du lịch', N'Cẩn thận, biết lắng nghe', N'Quản lý', N'Hải sản', 100, 0, NULL, NULL, '2024-03-05', '2024-03-05'),
    ('0934567890', 'phamhuong@gmail.com', '2001-07-22', 'b18492ba01b9cf5be83497b35c8f5be235802525c3f7d18af8fcf72a59bb9605', 'demo-salt', N'Phạm Hương D', N'Nữ', N'Nam', N'18-25', N'Yêu thích nấu ăn, thể thao, âm nhạc', N'Vui tính, năng động', N'Nhà thiết kế', N'Đồ nướng', 98, 0, NULL, NULL, '2024-04-12', '2024-04-12');
GO

CREATE TABLE dbo.RestaurantTables (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    TableNumber INT NOT NULL UNIQUE,
    Capacity INT NOT NULL DEFAULT 2,
    Status NVARCHAR(50) NOT NULL DEFAULT N'available',
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

INSERT INTO dbo.RestaurantTables (TableNumber, Capacity, Status, CreatedAt, UpdatedAt)
VALUES
    (1, 2, N'available', SYSUTCDATETIME(), SYSUTCDATETIME()),
    (2, 2, N'available', SYSUTCDATETIME(), SYSUTCDATETIME()),
    (3, 2, N'available', SYSUTCDATETIME(), SYSUTCDATETIME()),
    (4, 2, N'available', SYSUTCDATETIME(), SYSUTCDATETIME()),
    (5, 2, N'available', SYSUTCDATETIME(), SYSUTCDATETIME()),
    (6, 2, N'available', SYSUTCDATETIME(), SYSUTCDATETIME()),
    (7, 2, N'available', SYSUTCDATETIME(), SYSUTCDATETIME()),
    (8, 2, N'available', SYSUTCDATETIME(), SYSUTCDATETIME()),
    (9, 2, N'available', SYSUTCDATETIME(), SYSUTCDATETIME()),
    (10, 2, N'available', SYSUTCDATETIME(), SYSUTCDATETIME());
GO

CREATE TABLE dbo.AdminAccounts (
    Id VARCHAR(10) PRIMARY KEY,
    Username NVARCHAR(50) NOT NULL UNIQUE,
    Password NVARCHAR(255) NOT NULL,
    Name NVARCHAR(100) NOT NULL,
    Role NVARCHAR(50) NOT NULL DEFAULT N'admin',
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

INSERT INTO dbo.AdminAccounts (Id, Username, Password, Name, Role, CreatedAt)
VALUES
    ('ADMIN001', 'admin', 'admin123', N'Quản trị viên', N'admin', SYSUTCDATETIME()),
    ('ADMIN002', 'admin2', 'admin456', N'Trợ lý quản trị', N'admin', SYSUTCDATETIME());
GO

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
GO

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
GO

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
GO

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
GO

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
GO

CREATE INDEX IX_Users_Phone ON dbo.Users(Phone);
CREATE INDEX IX_Tickets_UserId ON dbo.Tickets(UserId);
CREATE INDEX IX_Tickets_Status ON dbo.Tickets(Status);
CREATE INDEX IX_Tickets_DateTime ON dbo.Tickets(DateTime);
CREATE INDEX IX_TicketRequests_Status ON dbo.TicketRequests(Status);
CREATE INDEX IX_Deposits_TicketId ON dbo.Deposits(TicketId);
CREATE INDEX IX_Deposits_Status ON dbo.Deposits(Status);
CREATE INDEX IX_Notifications_UserId ON dbo.Notifications(UserId);
CREATE INDEX IX_Notifications_IsRead ON dbo.Notifications(IsRead);
GO

PRINT N'✓ Database GhepDoiQuanAn đã tạo thành công!';
GO