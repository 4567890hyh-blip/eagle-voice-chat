require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose.set('strictQuery', false);

// ============ Middleware ============
const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token' });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        if (!user || user.isBanned) return res.status(401).json({ error: 'Unauthorized' });
        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

const authorize = (roles = []) => {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        if (roles.length && !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
};

// خدمة الملفات الثابتة
app.use(express.static(path.join(__dirname, '../../')));
app.use('/eagle-voice', express.static(path.join(__dirname, '../../eagle-voice')));
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// روابط الصفحات
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../index.html'));
});
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../../eagle-voice/index.html'));
});
app.get('/api/test', (req, res) => {
    res.json({ status: 'ok', message: 'Server is working!' });
});

const PORT = process.env.PORT || 3000;

// ============ النماذج (Models) ============

// نموذج المستخدم
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    email: { type: String, unique: true, sparse: true },
    password: { type: String, required: true },
    phone: { type: String, unique: true, sparse: true },
    avatar: { type: String, default: '/uploads/default-avatar.png' },
    fullName: String,
    country: { type: String, default: 'EG' },
    flag: { type: String, default: '🇪🇬' },
    gender: { type: String, enum: ['male', 'female', 'other'], default: 'other' },
    age: Number,
    uniqueId: { type: String, unique: true, sparse: true },
    
    // VIP System
    vipLevel: { type: Number, default: 0 },
    vipExpiry: Date,
    vipBenefits: {
        canEnterVipRooms: Boolean,
        cannotBeMuted: Boolean,
        cannotBeKicked: Boolean,
        animatedAvatar: Boolean,
        doubleXp: Boolean
    },
    
    // العملات
    coins: { type: Number, default: 0 },
    diamonds: { type: Number, default: 0 },
    
    // نظام المستويات
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    totalGiftsSent: { type: Number, default: 0 },
    totalGiftsReceived: { type: Number, default: 0 },
    
    // الصلاحيات
    role: { type: String, enum: ['user', 'admin', 'super_admin'], default: 'user' },
    
    // الوكالة
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency' },
    agencyRole: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
    agencyEarnings: { type: Number, default: 0 },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    // الـ Admins المدعوين
    invitedAdmins: [{
        adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency' },
        joinedAt: Date,
        earnings: Number
    }],
    invitedAdminsStats: {
        count: { type: Number, default: 0 },
        totalEarnings: { type: Number, default: 0 }
    },
    
    // الأمان
    isBanned: { type: Boolean, default: false },
    banReason: String,
    bannedUntil: Date,
    warnings: [{
        reason: String,
        date: Date,
        moderator: String,
        action: String
    }],
    riskScore: { type: Number, default: 0 },
    
    // معلومات الجهاز (لمكافحة الاحتيال)
    deviceId: { type: String },
    devices: [{
        deviceId: String,
        deviceName: String,
        deviceModel: String,
        os: String,
        lastLogin: Date,
        ip: String
    }],
    currentDeviceId: String,
    lastLoginIp: String,
    lastLoginDate: Date,
    
    // الجلسات
    sessions: [{
        token: String,
        deviceId: String,
        createdAt: Date,
        expiresAt: Date,
        ip: String
    }],
    
    // OTP
    otp: String,
    otpExpiry: Date,
    
    // المعاملات
    transactions: [{
        type: String,
        amount: Number,
        coins: Number,
        diamonds: Number,
        description: String,
        date: Date,
        status: String
    }],
    
    withdrawals: [{
        amount: Number,
        netAmount: Number,
        fee: Number,
        method: String,
        accountInfo: Object,
        status: String,
        requestedAt: Date,
        processedAt: Date
    }],
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// نموذج الغرفة
const RoomSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    category: { type: String, enum: ['general', 'music', 'gaming', 'vip'], default: 'general' },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    moderators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    password: String,
    isPrivate: Boolean,
    isVipOnly: Boolean,
    requiredLevel: { type: Number, default: 1 },
    maxMicrophones: { type: Number, default: 20 },
    isMicsLocked: { type: Boolean, default: false },
    users: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        joinedAt: Date
    }],
    currentSpeakers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    mutedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    kickedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    chatHistory: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: String,
        message: String,
        type: String,
        fileUrl: String,
        createdAt: Date
    }],
    soundEffects: {
        enterSound: String,
        exitSound: String,
        giftSound: String
    },
    totalMessages: { type: Number, default: 0 },
    totalGifts: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

// نموذج الوكالة
const AgencySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: String,
    logo: String,
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    // المضيفين (Hosts)
    hosts: [{
        hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        joinedAt: Date,
        invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        earnings: Number,
        diamondsEarned: Number
    }],
    
    // الـ Admins التابعين
    admins: [{
        adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        joinedAt: Date,
        earnings: Number
    }],
    
    // الداعمين
    sponsors: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        amount: Number,
        startDate: Date,
        endDate: Date
    }],
    
    // الإحصائيات المالية
    financialStats: {
        totalEarnings: { type: Number, default: 0 },
        monthlyEarnings: { type: Number, default: 0 },
        weeklyEarnings: { type: Number, default: 0 },
        todayEarnings: { type: Number, default: 0 },
        totalWithdrawn: { type: Number, default: 0 }
    },
    
    hostsStats: {
        count: { type: Number, default: 0 },
        totalEarnings: { type: Number, default: 0 }
    },
    
    settings: {
        commissionRate: { type: Number, default: 10 },
        minWithdrawal: { type: Number, default: 50 }
    },
    
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

// نموذج الهدية
const GiftSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    price: { type: Number, required: true },
    image: String,
    animation: String,
    sound: String,
    isLuckyGift: { type: Boolean, default: false },
    winChance: { type: Number, default: 10 },
    winMultiplier: { type: Number, default: 2 },
    isVip: { type: Boolean, default: false },
    minVipLevel: { type: Number, default: 0 },
    totalSent: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

// نموذج حقيبة الحظ
const LuckyBagSchema = new mongoose.Schema({
    name: String,
    price: { type: Number, required: true },
    image: String,
    rewards: [{
        type: { type: String, enum: ['coins', 'diamonds', 'vip', 'gift'] },
        amount: Number,
        giftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gift' },
        chance: Number
    }],
    isActive: Boolean
});

// نموذج اللعبة
const GameSchema = new mongoose.Schema({
    name: String,
    type: { type: String, enum: ['dice', 'wheel', 'slots'] },
    minBet: Number,
    maxBet: Number,
    houseEdge: { type: Number, default: 5 },
    maxConsecutiveLosses: { type: Number, default: 3 },
    aiProtectionEnabled: { type: Boolean, default: true },
    isActive: Boolean
});

// نموذج طلب السحب
const WithdrawalSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    amount: Number,
    method: { type: String, enum: ['vodafone', 'paypal', 'bank'] },
    accountInfo: Object,
    status: { type: String, enum: ['pending', 'completed', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

// نموذج الفعالية
const EventSchema = new mongoose.Schema({
    name: String,
    description: String,
    type: { type: String, enum: ['competition', 'bonus', 'gift'] },
    startDate: Date,
    endDate: Date,
    rewards: Object,
    isActive: Boolean,
    createdAt: { type: Date, default: Date.now }
});

// نموذج شاشة الظهور
const SplashScreenSchema = new mongoose.Schema({
    imageUrl: String,
    videoUrl: String,
    duration: Number,
    isActive: Boolean,
    startDate: Date,
    endDate: Date,
    createdAt: { type: Date, default: Date.now }
});

// نموذج البانر
const BannerSchema = new mongoose.Schema({
    title: String,
    imageUrl: String,
    linkUrl: String,
    position: { type: String, enum: ['home', 'sidebar', 'popup'], default: 'home' },
    viewCount: { type: Number, default: 0 },
    clickCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

// نموذج الإشعار
const NotificationSchema = new mongoose.Schema({
    title: String,
    body: String,
    type: { type: String, enum: ['general', 'vip', 'gift', 'event'], default: 'general' },
    targetUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isSent: { type: Boolean, default: false },
    sentAt: Date,
    createdAt: { type: Date, default: Date.now }
});

// نموذج إعدادات النظام
const SystemSettingsSchema = new mongoose.Schema({
    appName: { type: String, default: 'Eagle Voice Chat' },
    maintenanceMode: { type: Boolean, default: false },
    packages: { type: Map, of: Object, default: {} },
    giftSettings: {
        adminCommission: { type: Number, default: 30 },
        luckyGiftEnabled: { type: Boolean, default: true }
    },
    gameSettings: {
        houseEdge: { type: Number, default: 5 },
        maxConsecutiveLosses: { type: Number, default: 3 },
        aiProtectionEnabled: { type: Boolean, default: true }
    },
    withdrawalSettings: {
        minAmount: { type: Number, default: 10 },
        processingFee: { type: Number, default: 5 },
        enabledMethods: [String]
    },
    bannedWords: [{
        word: String,
        action: String,
        severity: Number
    }],
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now }
});

// إنشاء النماذج
const User = mongoose.model('User', UserSchema);
const Room = mongoose.model('Room', RoomSchema);
const Agency = mongoose.model('Agency', AgencySchema);
const Gift = mongoose.model('Gift', GiftSchema);
const LuckyBag = mongoose.model('LuckyBag', LuckyBagSchema);
const Game = mongoose.model('Game', GameSchema);
const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);
const Event = mongoose.model('Event', EventSchema);
const SplashScreen = mongoose.model('SplashScreen', SplashScreenSchema);
const Banner = mongoose.model('Banner', BannerSchema);
const Notification = mongoose.model('Notification', NotificationSchema);
const SystemSettings = mongoose.model('SystemSettings', SystemSettingsSchema);

// ============ دوال مساعدة ============
UserSchema.methods.calculateLevel = function() {
    return Math.floor(Math.sqrt(this.xp / 100)) + 1;
};

UserSchema.methods.addXP = async function(amount) {
    this.xp += amount;
    const newLevel = this.calculateLevel();
    let leveledUp = false;
    if (newLevel > this.level) {
        this.level = newLevel;
        leveledUp = true;
        const rewards = { 5: 100, 10: 500, 20: 2000, 50: 10000 };
        if (rewards[this.level]) this.coins += rewards[this.level];
    }
    await this.save();
    return { leveledUp, newLevel };
};

UserSchema.methods.addDiamonds = async function(amount, source = 'gift') {
    this.diamonds += amount;
    await this.save();
    return this.diamonds;
};

RoomSchema.methods.isModerator = function(userId) {
    return this.ownerId.toString() === userId.toString() || this.moderators.some(m => m.toString() === userId.toString());
};

// ============ API Routes ============

// ===== المصادقة =====
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email, phone, deviceId } = req.body;
        const existing = await User.findOne({ $or: [{ username }, { email }, { phone }] });
        if (existing) return res.status(400).json({ error: 'اسم المستخدم موجود' });
        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ username, email, phone, password: hashed, deviceId, devices: [{ deviceId, lastLogin: new Date(), ip: req.ip }] });
        await user.save();
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
        res.json({ success: true, token, user: { id: user._id, username: user.username, role: user.role, coins: user.coins, diamonds: user.diamonds } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password, deviceId, deviceInfo } = req.body;
        const user = await User.findOne({ $or: [{ username }, { email: username }, { phone: username }] });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'بيانات غير صحيحة' });
        }
        if (user.isBanned) return res.status(403).json({ error: `الحساب محظور: ${user.banReason}` });
        
        const existingDevice = user.devices.find(d => d.deviceId === deviceId);
        if (existingDevice) {
            existingDevice.lastLogin = new Date();
            existingDevice.ip = req.ip;
        } else {
            user.devices.push({ deviceId, deviceName: deviceInfo?.deviceName, lastLogin: new Date(), ip: req.ip });
        }
        
        user.currentDeviceId = deviceId;
        user.lastLoginIp = req.ip;
        user.lastLoginDate = new Date();
        
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
        user.sessions.push({ token, deviceId, createdAt: new Date(), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), ip: req.ip });
        await user.save();
        
        res.json({ success: true, token, user: { id: user._id, username: user.username, role: user.role, coins: user.coins, diamonds: user.diamonds, vipLevel: user.vipLevel } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/user', authenticate, async (req, res) => {
    res.json({ user: req.user });
});

app.post('/api/send-otp', async (req, res) => {
    try {
        const { phone } = req.body;
        const user = await User.findOne({ phone });
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
        const otp = Math.floor(100000 + Math.random() * 900000);
        user.otp = otp;
        user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();
        console.log(`OTP for ${phone}: ${otp}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/verify-otp', async (req, res) => {
    try {
        const { phone, otp, deviceId } = req.body;
        const user = await User.findOne({ phone });
        if (!user || user.otp !== parseInt(otp) || user.otpExpiry < new Date()) {
            return res.status(400).json({ error: 'رمز غير صحيح' });
        }
        user.otp = undefined;
        user.otpExpiry = undefined;
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
        res.json({ success: true, token, user: { id: user._id, username: user.username, role: user.role, coins: user.coins } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== إدارة المستخدمين (Admin) =====
app.get('/api/admin/users', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { search, role } = req.query;
    let query = {};
    if (search) query.username = { $regex: search, $options: 'i' };
    if (role) query.role = role;
    const users = await User.find(query).select('-password -sessions').limit(100);
    res.json({ users });
});

app.put('/api/admin/users/:userId', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { username, email, phone, country, gender, age, role, isBanned, vipLevel, newPassword } = req.body;
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (username) user.username = username;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (country) user.country = country;
    if (gender) user.gender = gender;
    if (age) user.age = age;
    if (role && req.user.role === 'super_admin') user.role = role;
    if (isBanned !== undefined) user.isBanned = isBanned;
    if (vipLevel !== undefined) user.vipLevel = vipLevel;
    if (newPassword) user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ success: true, user });
});

app.post('/api/admin/ban-user', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { userId, reason } = req.body;
    const user = await User.findByIdAndUpdate(userId, { isBanned: true, banReason: reason }, { new: true });
    res.json({ success: true, message: `تم حظر ${user.username}` });
});

app.post('/api/admin/unban-user/:userId', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const user = await User.findByIdAndUpdate(req.params.userId, { isBanned: false, banReason: null }, { new: true });
    res.json({ success: true, message: `تم فك الحظر عن ${user.username}` });
});

app.post('/api/admin/add-coins', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { userId, username, coins } = req.body;
    let user = null;
    if (userId) user = await User.findById(userId);
    else if (username) user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    user.coins += coins;
    await user.save();
    res.json({ success: true, message: `تم إضافة ${coins} عملة` });
});

app.post('/api/admin/add-diamonds', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { userId, username, diamonds } = req.body;
    let user = null;
    if (userId) user = await User.findById(userId);
    else if (username) user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    user.diamonds += diamonds;
    await user.save();
    res.json({ success: true, message: `تم إضافة ${diamonds} ألماس` });
});

app.post('/api/admin/reset-password', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { userId, newPassword } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ success: true });
});

app.get('/api/admin/user-devices/:userId', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const user = await User.findById(req.params.userId).select('devices currentDeviceId lastLoginIp');
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json({ devices: user.devices, currentDeviceId: user.currentDeviceId, lastLoginIp: user.lastLoginIp });
});

app.get('/api/admin/device-users/:deviceId', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const users = await User.find({ deviceId: req.params.deviceId }).select('username role coins diamonds isBanned lastLoginDate');
    res.json({ users });
});

app.get('/api/admin/stats', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const totalUsers = await User.countDocuments();
    const totalCoins = await User.aggregate([{ $group: { _id: null, total: { $sum: "$coins" } } }]);
    const totalDiamonds = await User.aggregate([{ $group: { _id: null, total: { $sum: "$diamonds" } } }]);
    const totalRevenue = await User.aggregate([{ $unwind: "$transactions" }, { $match: { "transactions.type": "purchase" } }, { $group: { _id: null, total: { $sum: "$transactions.amount" } } }]);
    res.json({ stats: { totalUsers, onlineUsers: global.onlineUsers?.size || 0, totalCoins: totalCoins[0]?.total || 0, totalDiamonds: totalDiamonds[0]?.total || 0, totalRevenue: totalRevenue[0]?.total || 0 } });
});

// ===== إدارة الغرف =====
app.get('/api/rooms', async (req, res) => {
    const rooms = await Room.find().sort({ createdAt: -1 });
    res.json(rooms);
});

app.post('/api/rooms', authenticate, async (req, res) => {
    const existingRoom = await Room.findOne({ ownerId: req.user._id });
    if (existingRoom) return res.status(400).json({ error: 'لديك غرفة بالفعل' });
    const room = new Room({ name: req.body.name, ownerId: req.user._id });
    await room.save();
    res.json({ success: true, room });
});

app.put('/api/rooms/:roomId', authenticate, async (req, res) => {
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'الغرفة غير موجودة' });
    if (room.ownerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    if (req.body.name) room.name = req.body.name;
    if (req.body.password !== undefined) room.password = req.body.password;
    if (req.body.isMicsLocked !== undefined) room.isMicsLocked = req.body.isMicsLocked;
    await room.save();
    res.json({ success: true, room });
});

app.post('/api/rooms/:roomId/mute', authenticate, async (req, res) => {
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'الغرفة غير موجودة' });
    if (!room.isModerator(req.user._id)) return res.status(403).json({ error: 'غير مصرح' });
    const { userId, duration } = req.body;
    if (!room.mutedUsers.includes(userId)) room.mutedUsers.push(userId);
    room.currentSpeakers = room.currentSpeakers.filter(id => id.toString() !== userId);
    await room.save();
    res.json({ success: true });
});

app.post('/api/rooms/:roomId/kick', authenticate, async (req, res) => {
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'الغرفة غير موجودة' });
    if (room.ownerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'صاحب الغرفة فقط' });
    }
    const { userId } = req.body;
    room.kickedUsers.push(userId);
    room.users = room.users.filter(u => u.userId.toString() !== userId);
    room.currentSpeakers = room.currentSpeakers.filter(id => id.toString() !== userId);
    await room.save();
    res.json({ success: true });
});

app.delete('/api/rooms/:roomId/chat', authenticate, async (req, res) => {
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'الغرفة غير موجودة' });
    if (!room.isModerator(req.user._id)) return res.status(403).json({ error: 'غير مصرح' });
    room.chatHistory = [];
    await room.save();
    res.json({ success: true });
});

// ===== الوكالات =====
app.get('/api/agencies', authenticate, async (req, res) => {
    const agencies = await Agency.find().populate('ownerId', 'username');
    res.json({ agencies });
});

app.post('/api/agency/create', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { name, description, logo } = req.body;
    const existing = await Agency.findOne({ name });
    if (existing) return res.status(400).json({ error: 'الاسم موجود' });
    const agency = new Agency({ name, description, logo, ownerId: req.user._id });
    await agency.save();
    res.json({ success: true, agency });
});

app.post('/api/agency/add-host', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { agencyId, hostId } = req.body;
    const agency = await Agency.findById(agencyId);
    if (!agency) return res.status(404).json({ error: 'الوكالة غير موجودة' });
    if (agency.ownerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'فقط المالك' });
    }
    agency.hosts.push({ hostId, joinedAt: new Date(), invitedBy: req.user._id });
    agency.hostsStats.count += 1;
    await agency.save();
    res.json({ success: true });
});

app.delete('/api/agency/remove-host', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { agencyId, hostId } = req.body;
    const agency = await Agency.findById(agencyId);
    if (!agency) return res.status(404).json({ error: 'الوكالة غير موجودة' });
    if (agency.ownerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'فقط المالك' });
    }
    agency.hosts = agency.hosts.filter(h => h.hostId.toString() !== hostId);
    agency.hostsStats.count = agency.hosts.length;
    await agency.save();
    res.json({ success: true });
});

app.get('/api/agency/:agencyId/earnings', authenticate, async (req, res) => {
    const agency = await Agency.findById(req.params.agencyId).populate('hosts.hostId', 'username diamonds');
    if (!agency) return res.status(404).json({ error: 'الوكالة غير موجودة' });
    if (agency.ownerId.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    const hostsDetails = agency.hosts.map(h => ({
        username: h.hostId?.username,
        diamonds: h.hostId?.diamonds || 0,
        joinedAt: h.joinedAt
    }));
    res.json({ agency: { name: agency.name, totalEarnings: agency.financialStats.totalEarnings }, hosts: hostsDetails });
});

// ===== VIP System =====
app.post('/api/vip/buy', authenticate, async (req, res) => {
    const { level } = req.body;
    const prices = { 1: 100, 2: 300, 3: 600, 4: 1000, 5: 2000 };
    const price = prices[level];
    if (!price) return res.status(400).json({ error: 'مستوى غير صحيح' });
    if (req.user.coins < price) return res.status(400).json({ error: 'رصيد غير كاف' });
    req.user.coins -= price;
    req.user.vipLevel = level;
    req.user.vipExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    req.user.vipBenefits = {
        canEnterVipRooms: true,
        cannotBeMuted: level >= 2,
        cannotBeKicked: level >= 3,
        animatedAvatar: level >= 4,
        doubleXp: level >= 4
    };
    await req.user.save();
    res.json({ success: true, vipLevel: level, expiry: req.user.vipExpiry });
});

app.post('/api/admin/give-vip', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { userId, username, level, days } = req.body;
    let user = null;
    if (userId) user = await User.findById(userId);
    else if (username) user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    user.vipLevel = level;
    user.vipExpiry = new Date(Date.now() + (days || 30) * 24 * 60 * 60 * 1000);
    user.vipBenefits = {
        canEnterVipRooms: true,
        cannotBeMuted: level >= 2,
        cannotBeKicked: level >= 3,
        animatedAvatar: level >= 4,
        doubleXp: level >= 4
    };
    await user.save();
    res.json({ success: true, message: `تم ترقية ${user.username} إلى VIP ${level}` });
});

app.post('/api/admin/remove-vip/:userId', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    user.vipLevel = 0;
    user.vipExpiry = null;
    user.vipBenefits = {};
    await user.save();
    res.json({ success: true });
});

app.get('/api/vip/ranking', async (req, res) => {
    const users = await User.find({ vipLevel: { $gt: 0 } }).sort({ vipLevel: -1, coins: -1 }).limit(100).select('username vipLevel coins');
    res.json(users);
});

// ===== الهدايا =====
app.get('/api/admin/gifts', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json(await Gift.find());
});

app.post('/api/admin/gifts', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const gift = new Gift(req.body);
    await gift.save();
    res.json({ success: true, gift });
});

app.put('/api/admin/gifts/:giftId', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const gift = await Gift.findByIdAndUpdate(req.params.giftId, req.body, { new: true });
    res.json({ success: true, gift });
});

app.delete('/api/admin/gifts/:giftId', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    await Gift.findByIdAndDelete(req.params.giftId);
    res.json({ success: true });
});

app.post('/api/gift/send', authenticate, async (req, res) => {
    const { giftId, targetUserId, roomId } = req.body;
    const gift = await Gift.findById(giftId);
    if (!gift) return res.status(404).json({ error: 'الهدية غير موجودة' });
    if (req.user.coins < gift.price) return res.status(400).json({ error: 'رصيد غير كاف' });
    
    req.user.coins -= gift.price;
    let giftValue = gift.price;
    let isLuckyWin = false;
    
    if (gift.isLuckyGift) {
        const random = Math.random() * 100;
        if (random <= gift.winChance) {
            giftValue = gift.price * gift.winMultiplier;
            isLuckyWin = true;
        }
    }
    
    const target = await User.findById(targetUserId);
    if (target) {
        target.diamonds += giftValue;
        target.totalGiftsReceived += 1;
        await target.save();
    }
    
    await req.user.addXP(gift.price);
    req.user.totalGiftsSent += 1;
    await req.user.save();
    
    if (roomId && global.io) {
        global.io.to(`room:${roomId}`).emit('gift-received', {
            from: req.user.username,
            gift: gift.name,
            to: target?.username,
            isLucky: isLuckyWin,
            value: giftValue
        });
    }
    
    res.json({ success: true, isLuckyWin, value: giftValue, newBalance: req.user.coins });
});

app.post('/api/self-support', authenticate, async (req, res) => {
    const { giftId } = req.body;
    const gift = await Gift.findById(giftId);
    if (!gift) return res.status(404).json({ error: 'الهدية غير موجودة' });
    if (req.user.coins < gift.price) return res.status(400).json({ error: 'رصيد غير كاف' });
    req.user.coins -= gift.price;
    await req.user.addDiamonds(gift.price, 'self_support');
    await req.user.addXP(gift.price);
    req.user.totalGiftsSent += 1;
    req.user.totalGiftsReceived += 1;
    await req.user.save();
    res.json({ success: true, message: `دعمت نفسك بـ ${gift.name}`, newBalance: req.user.coins, newDiamonds: req.user.diamonds });
});

app.get('/api/host-salary', authenticate, async (req, res) => {
    const salary = Math.floor(req.user.diamonds / 15000);
    res.json({ diamonds: req.user.diamonds, salary, nextSalaryAt: 15000 - (req.user.diamonds % 15000) });
});

// ===== حقائب الحظ =====
app.get('/api/admin/lucky-bags', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json(await LuckyBag.find());
});

app.post('/api/admin/lucky-bags', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const bag = new LuckyBag(req.body);
    await bag.save();
    res.json({ success: true, bag });
});

app.post('/api/lucky-bag/open', authenticate, async (req, res) => {
    const { bagId } = req.body;
    const bag = await LuckyBag.findById(bagId);
    if (!bag) return res.status(404).json({ error: 'الحقيبة غير موجودة' });
    if (req.user.coins < bag.price) return res.status(400).json({ error: 'رصيد غير كاف' });
    req.user.coins -= bag.price;
    const totalChance = bag.rewards.reduce((sum, r) => sum + r.chance, 0);
    let random = Math.random() * totalChance;
    let reward = bag.rewards[0];
    for (const r of bag.rewards) {
        if (random <= r.chance) { reward = r; break; }
        random -= r.chance;
    }
    let rewardMessage = '';
    if (reward.type === 'coins') {
        req.user.coins += reward.amount;
        rewardMessage = `🎉 ربحت ${reward.amount} عملة!`;
    } else if (reward.type === 'diamonds') {
        req.user.diamonds += reward.amount;
        rewardMessage = `💎 ربحت ${reward.amount} ألماس!`;
    } else if (reward.type === 'vip') {
        req.user.vipLevel = reward.amount;
        req.user.vipExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        rewardMessage = `👑 ربحت VIP مستوى ${reward.amount}!`;
    }
    await req.user.save();
    res.json({ success: true, reward: rewardMessage, newBalance: req.user.coins, newDiamonds: req.user.diamonds });
});

// ===== الألعاب =====
const userLossStreak = new Map();

app.post('/api/game/play', authenticate, async (req, res) => {
    const { gameId, betAmount } = req.body;
    const game = await Game.findById(gameId);
    if (!game) return res.status(404).json({ error: 'اللعبة غير موجودة' });
    if (betAmount < game.minBet || betAmount > game.maxBet) {
        return res.status(400).json({ error: 'مبلغ الرهان غير صحيح' });
    }
    if (req.user.coins < betAmount) return res.status(400).json({ error: 'رصيد غير كاف' });
    
    let currentStreak = userLossStreak.get(req.user._id.toString()) || 0;
    let winChance = 50 - game.houseEdge;
    
    if (game.aiProtectionEnabled && currentStreak >= game.maxConsecutiveLosses) {
        winChance += (currentStreak - game.maxConsecutiveLosses + 1) * 10;
        winChance = Math.min(winChance, 90);
    }
    
    const isWin = Math.random() * 100 <= winChance;
    if (isWin) {
        const winAmount = betAmount * 2;
        const adminProfit = winAmount * (game.houseEdge / 100);
        const netWin = winAmount - adminProfit;
        req.user.coins += netWin;
        currentStreak = 0;
        await req.user.save();
        userLossStreak.set(req.user._id.toString(), currentStreak);
        res.json({ success: true, win: true, winAmount: netWin, newBalance: req.user.coins, streak: currentStreak });
    } else {
        req.user.coins -= betAmount;
        currentStreak += 1;
        await req.user.save();
        userLossStreak.set(req.user._id.toString(), currentStreak);
        res.json({ success: true, win: false, winAmount: 0, newBalance: req.user.coins, streak: currentStreak });
    }
});

app.get('/api/admin/games', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json(await Game.find());
});

app.post('/api/admin/games', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const game = new Game(req.body);
    await game.save();
    res.json({ success: true, game });
});

app.put('/api/admin/games/:gameId', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const game = await Game.findByIdAndUpdate(req.params.gameId, req.body, { new: true });
    res.json({ success: true, game });
});

// ===== المخالفات =====
app.post('/api/admin/warnings/add', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { userId, reason, action } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    user.warnings.push({ reason, date: new Date(), moderator: req.user.username, action: action || 'warn' });
    user.riskScore += 10;
    if (user.riskScore >= 100) {
        user.isBanned = true;
        user.banReason = 'تجاوز حد المخاطر التلقائي';
    }
    await user.save();
    res.json({ success: true, riskScore: user.riskScore, isBanned: user.isBanned });
});

app.get('/api/admin/warnings/:userId', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const user = await User.findById(req.params.userId).select('warnings riskScore');
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json({ warnings: user.warnings, riskScore: user.riskScore });
});

app.delete('/api/admin/warnings/:userId/:warningIndex', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const index = parseInt(req.params.warningIndex);
    if (index >= 0 && index < user.warnings.length) {
        user.warnings.splice(index, 1);
        user.riskScore = Math.max(0, user.riskScore - 10);
        await user.save();
    }
    res.json({ success: true, riskScore: user.riskScore });
});

// AI Moderation
app.post('/api/moderation/check', authenticate, async (req, res) => {
    const { message } = req.body;
    const bannedWords = ['كلمة ممنوعة', 'سيء', 'بذيء'];
    const foundWord = bannedWords.find(word => message.toLowerCase().includes(word.toLowerCase()));
    if (foundWord) {
        req.user.warnings.push({ reason: `كلمة محظورة: ${foundWord}`, date: new Date(), moderator: 'AI System', action: 'warn' });
        req.user.riskScore += 5;
        if (req.user.riskScore >= 100) {
            req.user.isBanned = true;
            req.user.banReason = 'تجاوز حد المخاطر التلقائي';
        }
        await req.user.save();
        return res.json({ blocked: true, reason: `الرسالة تحتوي على كلمة ممنوعة: ${foundWord}`, riskScore: req.user.riskScore });
    }
    res.json({ blocked: false });
});

// ===== الدفع =====
const PACKAGES = {
    '1000_coins': { price: 0.10, coins: 1000 },
    '5000_coins': { price: 0.50, coins: 5000 },
    '10000_coins': { price: 1.00, coins: 10000 },
    '50000_coins': { price: 4.99, coins: 50000 },
    '100000_coins': { price: 9.99, coins: 100000 }
};

app.get('/api/packages', async (req, res) => {
    res.json(PACKAGES);
});

app.post('/api/payment/purchase', authenticate, async (req, res) => {
    const { packageId } = req.body;
    const pkg = PACKAGES[packageId];
    if (!pkg) return res.status(400).json({ error: 'الباقة غير موجودة' });
    req.user.coins += pkg.coins;
    req.user.transactions.push({
        type: 'purchase',
        amount: pkg.price,
        coins: pkg.coins,
        description: `شراء ${pkg.coins} عملة`,
        date: new Date(),
        status: 'completed'
    });
    await req.user.save();
    res.json({ success: true, newBalance: req.user.coins });
});

app.post('/api/payment/withdraw', authenticate, async (req, res) => {
    const { amount, method, accountInfo } = req.body;
    const dollarsFromDiamonds = Math.floor(req.user.diamonds / 15000);
    if (amount > dollarsFromDiamonds) return res.status(400).json({ error: 'رصيد غير كاف' });
    const withdrawal = new Withdrawal({ userId: req.user._id, amount, method, accountInfo, status: 'pending' });
    await withdrawal.save();
    req.user.diamonds -= amount * 15000;
    await req.user.save();
    res.json({ success: true, message: `تم تقديم طلب سحب بقيمة ${amount} دولار`, requestId: withdrawal._id });
});

app.get('/api/admin/withdrawals', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json(await Withdrawal.find().populate('userId', 'username').sort({ createdAt: -1 }));
});

app.post('/api/admin/withdrawals/:id/approve', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ error: 'الطلب غير موجود' });
    withdrawal.status = 'completed';
    await withdrawal.save();
    res.json({ success: true });
});

app.post('/api/admin/withdrawals/:id/reject', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ error: 'الطلب غير موجود' });
    withdrawal.status = 'rejected';
    await withdrawal.save();
    res.json({ success: true });
});

// ===== الفعاليات =====
app.get('/api/events/active', async (req, res) => {
    const now = new Date();
    const events = await Event.find({ isActive: true, startDate: { $lte: now }, endDate: { $gte: now } });
    res.json(events);
});

app.get('/api/admin/events', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json(await Event.find().sort({ createdAt: -1 }));
});

app.post('/api/admin/events', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const event = new Event(req.body);
    await event.save();
    res.json({ success: true, event });
});

app.delete('/api/admin/events/:id', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    await Event.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// ===== شاشة الظهور =====
app.get('/api/splash/active', async (req, res) => {
    const now = new Date();
    const splash = await SplashScreen.findOne({ isActive: true, startDate: { $lte: now }, endDate: { $gte: now } });
    res.json(splash || null);
});

app.get('/api/admin/splash', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json(await SplashScreen.find().sort({ createdAt: -1 }));
});

app.post('/api/admin/splash', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const splash = new SplashScreen(req.body);
    await splash.save();
    res.json({ success: true, splash });
});

app.delete('/api/admin/splash/:id', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    await SplashScreen.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// ===== البانرات =====
app.get('/api/admin/banners', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json(await Banner.find().sort({ createdAt: -1 }));
});

app.post('/api/admin/banners', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const banner = new Banner(req.body);
    await banner.save();
    res.json({ success: true, banner });
});

app.delete('/api/admin/banners/:id', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    await Banner.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// ===== الإشعارات =====
app.post('/api/admin/notifications/send', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { title, body, type, targetAll } = req.body;
    const notification = new Notification({ title, body, type });
    if (targetAll) {
        const users = await User.find();
        notification.targetUsers = users.map(u => u._id);
    }
    notification.isSent = true;
    notification.sentAt = new Date();
    await notification.save();
    res.json({ success: true });
});

app.get('/api/admin/notifications', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json(await Notification.find().sort({ createdAt: -1 }).limit(50));
});

// ===== إحصائيات متقدمة =====
app.get('/api/admin/advanced-stats', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const totalUsers = await User.countDocuments();
    const vipUsers = await User.countDocuments({ vipLevel: { $gt: 0 } });
    const totalCoins = await User.aggregate([{ $group: { _id: null, total: { $sum: "$coins" } } }]);
    const totalDiamonds = await User.aggregate([{ $group: { _id: null, total: { $sum: "$diamonds" } } }]);
    const totalGiftsSent = await User.aggregate([{ $group: { _id: null, total: { $sum: "$totalGiftsSent" } } }]);
    const bannedUsers = await User.countDocuments({ isBanned: true });
    const newUsersToday = await User.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } });
    
    res.json({
        users: { totalUsers, newUsersToday },
        vip: { total: vipUsers },
        finance: { totalCoins: totalCoins[0]?.total || 0, totalDiamonds: totalDiamonds[0]?.total || 0 },
        gifts: { totalSent: totalGiftsSent[0]?.total || 0 },
        moderation: { bannedUsers }
    });
});

// ===== الدعوات =====
app.post('/api/invitations/send-admin', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { targetUserId, targetUsername, createNewAgency } = req.body;
    let targetUser = null;
    if (targetUserId) targetUser = await User.findById(targetUserId);
    else if (targetUsername) targetUser = await User.findOne({ username: targetUsername });
    if (!targetUser) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (targetUser.role === 'admin' || targetUser.role === 'super_admin') {
        return res.status(400).json({ error: 'المستخدم بالفعل Admin' });
    }
    targetUser.role = 'admin';
    if (createNewAgency) {
        const newAgency = new Agency({ name: `${targetUser.username}_Agency`, ownerId: targetUser._id });
        await newAgency.save();
        targetUser.agencyId = newAgency._id;
    }
    await targetUser.save();
    
    const sender = await User.findById(req.user.userId);
    sender.invitedAdmins.push({
        adminId: targetUser._id,
        agencyId: targetUser.agencyId,
        joinedAt: new Date(),
        earnings: 0
    });
    sender.invitedAdminsStats.count += 1;
    await sender.save();
    
    res.json({ success: true, message: `تمت ترقية ${targetUser.username} إلى Admin` });
});

app.get('/api/invitations/invited-admins', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const user = await User.findById(req.user.userId).populate('invitedAdmins.adminId', 'username email phone diamonds');
    const admins = user.invitedAdmins.map(inv => ({
        id: inv.adminId?._id,
        username: inv.adminId?.username,
        email: inv.adminId?.email,
        phone: inv.adminId?.phone,
        earnings: inv.adminId?.diamonds || 0,
        joinedAt: inv.joinedAt
    }));
    res.json({ summary: { totalAdmins: admins.length, totalEarnings: admins.reduce((sum, a) => sum + a.earnings, 0) }, admins });
});

app.get('/api/invitations/my-agencies', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const myAgency = await Agency.findOne({ ownerId: req.user.userId });
    const user = await User.findById(req.user.userId);
    const subAgencies = [];
    for (const invited of user.invitedAdmins) {
        const agency = await Agency.findById(invited.agencyId);
        if (agency) {
            subAgencies.push({ id: agency._id, name: agency.name, earnings: agency.financialStats.totalEarnings });
        }
    }
    res.json({
        myAgency: myAgency ? { id: myAgency._id, name: myAgency.name, totalEarnings: myAgency.financialStats.totalEarnings } : null,
        subAgencies
    });
});

// ===== إعدادات النظام =====
app.get('/api/admin/settings', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    let settings = await SystemSettings.findOne();
    if (!settings) settings = new SystemSettings();
    res.json(settings);
});

app.put('/api/admin/settings', authenticate, authorize(['super_admin']), async (req, res) => {
    let settings = await SystemSettings.findOne();
    if (!settings) settings = new SystemSettings();
    const { appName, maintenanceMode, packages, giftSettings, gameSettings, withdrawalSettings } = req.body;
    if (appName) settings.appName = appName;
    if (maintenanceMode !== undefined) settings.maintenanceMode = maintenanceMode;
    if (packages) settings.packages = packages;
    if (giftSettings) settings.giftSettings = giftSettings;
    if (gameSettings) settings.gameSettings = gameSettings;
    if (withdrawalSettings) settings.withdrawalSettings = withdrawalSettings;
    settings.updatedBy = req.user.userId;
    settings.updatedAt = new Date();
    await settings.save();
    res.json({ success: true });
});

// ============ إنشاء Super Admin ============
const createSuperAdmin = async () => {
    const existing = await User.findOne({ role: 'super_admin' });
    if (!existing) {
        const hashed = await bcrypt.hash('SuperAdmin123!', 10);
        await User.create({
            username: 'SuperAdmin',
            email: 'superadmin@eaglevoice.com',
            password: hashed,
            role: 'super_admin',
            coins: 999999,
            diamonds: 999999
        });
        console.log('✅ Super Admin created: superadmin@eaglevoice.com / SuperAdmin123!');
    }
};

// ============ تشغيل الخادم ============
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not defined');
    process.exit(1);
}

mongoose.connect(MONGODB_URI, { dbName: 'eagle-voice-chat' })
    .then(async () => {
        console.log('✅ MongoDB connected');
        await createSuperAdmin();

        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`🦅 Eagle Voice Chat running on port ${PORT}`);
            console.log(`📱 App: http://localhost:${PORT}`);
            console.log(`🖥️ Admin: http://localhost:${PORT}/admin`);
        });

        // ============ Socket.IO ============
        const socketIo = require('socket.io');
        const io = socketIo(server, { cors: { origin: "*" }, transports: ['websocket', 'polling'] });
        global.io = io;
        global.onlineUsers = new Map();

        io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token;
                if (!token) return next(new Error('No token'));
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = await User.findById(decoded.userId);
                if (!user || user.isBanned) return next(new Error('Unauthorized'));
                socket.user = user;
                next();
            } catch (err) { next(new Error('Auth failed')); }
        });

        io.on('connection', (socket) => {
            console.log('✅ Socket connected:', socket.user.username);
            global.onlineUsers.set(socket.user._id.toString(), socket.id);

            socket.on('create-room', async (data, callback) => {
                try {
                    const existing = await Room.findOne({ ownerId: socket.user._id });
                    if (existing) return callback({ error: 'لديك غرفة بالفعل' });
                    const room = new Room({ name: data.name, ownerId: socket.user._id });
                    await room.save();
                    socket.join(`room:${room._id}`);
                    callback({ success: true, room });
                    io.emit('rooms-updated');
                } catch (error) { callback({ error: error.message }); }
            });

            socket.on('join-room', async (data, callback) => {
                try {
                    socket.join(`room:${data.roomId}`);
                    callback({ success: true });
                    socket.to(`room:${data.roomId}`).emit('user-joined', socket.user.username);
                } catch (error) { callback({ error: error.message }); }
            });

            socket.on('send-message', (data) => {
                io.to(`room:${data.roomId}`).emit('new-message', {
                    username: socket.user.username,
                    message: data.message,
                    time: new Date()
                });
            });

            socket.on('send-gift-notification', (data) => {
                io.to(`room:${data.roomId}`).emit('gift-notification', {
                    from: socket.user.username,
                    gift: data.giftName,
                    to: data.targetUsername
                });
            });

            socket.on('vip-upgrade', (data) => {
                io.emit('vip-announcement', {
                    username: socket.user.username,
                    newLevel: data.level
                });
            });

            socket.on('game-win', (data) => {
                io.to(`room:${data.roomId}`).emit('game-announcement', {
                    username: socket.user.username,
                    game: data.gameName,
                    winAmount: data.winAmount
                });
            });

            socket.on('disconnect', () => {
                global.onlineUsers.delete(socket.user._id.toString());
                console.log('❌ Socket disconnected:', socket.user.username);
            });
        });
    })
    .catch(err => {
        console.error('❌ MongoDB error:', err.message);
        process.exit(1);
    });
