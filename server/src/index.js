require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');

// ✅ إصلاح تحذير Mongoose
mongoose.set('strictQuery', false);

const app = express();
app.use(cors());
app.use(express.json());

// ============ CORS Headers إضافية ============
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

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

// روابط الصفحات
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../../eagle-voice/index.html'));
});
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../index.html'));
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
    role: { type: String, enum: ['user', 'admin', 'super_admin'], default: 'user' },
    coins: { type: Number, default: 0 },
    diamonds: { type: Number, default: 0 },
    vipLevel: { type: Number, default: 0 },
    vipExpiry: Date,
    vipBenefits: {
        canEnterVipRooms: Boolean,
        cannotBeMuted: Boolean,
        cannotBeKicked: Boolean,
        animatedAvatar: Boolean,
        doubleXp: Boolean
    },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    totalGiftsSent: { type: Number, default: 0 },
    totalGiftsReceived: { type: Number, default: 0 },
    isBanned: { type: Boolean, default: false },
    banReason: String,
    bannedUntil: Date,
    mutedUntil: Date,
    warnings: [{ reason: String, date: Date, moderator: String, action: String }],
    riskScore: { type: Number, default: 0 },
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency' },
    transactions: [{ type: String, amount: Number, coins: Number, diamonds: Number, description: String, date: Date, status: String }],
    createdAt: { type: Date, default: Date.now }
});

// نموذج الغرفة
const RoomSchema = new mongoose.Schema({
    name: { type: String, required: true },
    ownerId: { type: String, required: true },
    users: [{ userId: String, joinedAt: Date }],
    createdAt: { type: Date, default: Date.now }
});

// نموذج الوكالة
const AgencySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    ownerId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

// نموذج الهدية
const GiftSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    price: { type: Number, required: true },
    image: String,
    animation: String,
    isLuckyGift: { type: Boolean, default: false },
    winChance: { type: Number, default: 10 },
    winMultiplier: { type: Number, default: 2 },
    isVip: { type: Boolean, default: false },
    minVipLevel: { type: Number, default: 0 },
    totalSent: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
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
    isActive: Boolean
});

// نموذج شاشة الظهور
const SplashScreenSchema = new mongoose.Schema({
    imageUrl: String,
    videoUrl: String,
    duration: Number,
    isActive: Boolean,
    startDate: Date,
    endDate: Date
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

// إنشاء النماذج
const User = mongoose.model('User', UserSchema);
const Room = mongoose.model('Room', RoomSchema);
const Agency = mongoose.model('Agency', AgencySchema);
const Gift = mongoose.model('Gift', GiftSchema);
const Game = mongoose.model('Game', GameSchema);
const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);
const Event = mongoose.model('Event', EventSchema);
const SplashScreen = mongoose.model('SplashScreen', SplashScreenSchema);
const Banner = mongoose.model('Banner', BannerSchema);

// ============ API Routes الأساسية ============

app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ error: 'اسم المستخدم موجود' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, email, password: hashedPassword });
        await user.save();
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
        res.json({ success: true, token, user: { id: user._id, username: user.username, role: user.role, coins: user.coins, diamonds: user.diamonds } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'بيانات غير صحيحة' });
        }
        if (user.isBanned) return res.status(403).json({ error: 'الحساب محظور' });
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
        res.json({ success: true, token, user: { id: user._id, username: user.username, role: user.role, coins: user.coins, diamonds: user.diamonds, vipLevel: user.vipLevel } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/user', authenticate, async (req, res) => {
    res.json({ user: req.user });
});

app.get('/api/rooms', async (req, res) => {
    const rooms = await Room.find().sort({ createdAt: -1 });
    res.json(rooms);
});

app.post('/api/rooms', authenticate, async (req, res) => {
    const room = new Room({ name: req.body.name, ownerId: req.user._id });
    await room.save();
    res.json({ success: true, room });
});

app.get('/api/agencies', authenticate, async (req, res) => {
    const agencies = await Agency.find().populate('ownerId', 'username');
    res.json({ agencies });
});

// ============ Admin Routes ============

app.get('/api/admin/users', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { search, role } = req.query;
    let query = {};
    if (search) query.username = { $regex: search, $options: 'i' };
    if (role) query.role = role;
    const users = await User.find(query).select('-password').limit(100);
    res.json({ users });
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

app.get('/api/admin/stats', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const totalUsers = await User.countDocuments();
    const totalCoins = await User.aggregate([{ $group: { _id: null, total: { $sum: "$coins" } } }]);
    const totalRevenue = await User.aggregate([{ $unwind: "$transactions" }, { $match: { "transactions.type": "purchase" } }, { $group: { _id: null, total: { $sum: "$transactions.amount" } } }]);
    res.json({ stats: { totalUsers, onlineUsers: global.onlineUsers?.size || 0, totalCoins: totalCoins[0]?.total || 0, totalRevenue: totalRevenue[0]?.total || 0 } });
});

// ============ Agency Routes ============

app.post('/api/agency/create', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { name } = req.body;
    const existingAgency = await Agency.findOne({ name });
    if (existingAgency) return res.status(400).json({ error: 'الاسم موجود بالفعل' });
    const agency = new Agency({ name, ownerId: req.user._id });
    await agency.save();
    res.json({ success: true, agency });
});

// ============ VIP System ============

const VIP_PRICES = { 1: 100, 2: 300, 3: 600, 4: 1000, 5: 2000 };
const VIP_DAYS = { 1: 30, 2: 30, 3: 30, 4: 30, 5: 30 };

app.post('/api/vip/buy', authenticate, async (req, res) => {
    const { level } = req.body;
    const price = VIP_PRICES[level];
    if (!price) return res.status(400).json({ error: 'مستوى غير صحيح' });
    if (req.user.coins < price) return res.status(400).json({ error: 'رصيد غير كاف' });
    req.user.coins -= price;
    req.user.vipLevel = level;
    req.user.vipExpiry = new Date(Date.now() + VIP_DAYS[level] * 24 * 60 * 60 * 1000);
    req.user.vipBenefits = { canEnterVipRooms: true, cannotBeMuted: level >= 2, cannotBeKicked: level >= 3, animatedAvatar: level >= 4, doubleXp: level >= 4 };
    await req.user.save();
    res.json({ success: true, vipLevel: level, expiry: req.user.vipExpiry, benefits: req.user.vipBenefits });
});

app.post('/api/admin/give-vip', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { userId, username, level, days } = req.body;
    let user = null;
    if (userId) user = await User.findById(userId);
    else if (username) user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    user.vipLevel = level;
    user.vipExpiry = new Date(Date.now() + (days || 30) * 24 * 60 * 60 * 1000);
    user.vipBenefits = { canEnterVipRooms: true, cannotBeMuted: level >= 2, cannotBeKicked: level >= 3, animatedAvatar: level >= 4, doubleXp: level >= 4 };
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
    res.json({ success: true, message: `تم سحب VIP من ${user.username}` });
});

app.get('/api/vip/ranking', async (req, res) => {
    const vipUsers = await User.find({ vipLevel: { $gt: 0 } }).sort({ vipLevel: -1, coins: -1 }).limit(100).select('username vipLevel coins');
    res.json(vipUsers);
});

// ============ Gifts System ============

app.post('/api/gift/send', authenticate, async (req, res) => {
    const { giftId, targetUserId, roomId } = req.body;
    const gift = await Gift.findById(giftId);
    if (!gift) return res.status(404).json({ error: 'الهدية غير موجودة' });
    if (!gift.isActive) return res.status(400).json({ error: 'الهدية غير متاحة' });
    if (gift.isVip && req.user.vipLevel < gift.minVipLevel) return res.status(403).json({ error: 'هدية VIP فقط' });
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
    
    const targetUser = await User.findById(targetUserId);
    if (targetUser) {
        targetUser.diamonds += giftValue;
        targetUser.totalGiftsReceived += 1;
        await targetUser.save();
    }
    
    if (gift.isLuckyGift && isLuckyWin) {
        req.user.xp += giftValue;
        const newLevel = Math.floor(Math.sqrt(req.user.xp / 100)) + 1;
        if (newLevel > req.user.level) req.user.level = newLevel;
    }
    req.user.totalGiftsSent += 1;
    await req.user.save();
    
    if (roomId && global.io) global.io.to(`room:${roomId}`).emit('gift-received', { from: req.user.username, gift: gift.name, to: targetUser?.username, isLucky: isLuckyWin, value: giftValue });
    res.json({ success: true, isLuckyWin, value: giftValue, newBalance: req.user.coins });
});

app.post('/api/admin/gifts', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const gift = new Gift(req.body);
    await gift.save();
    res.json({ success: true, gift });
});

app.get('/api/admin/gifts', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json(await Gift.find());
});

app.put('/api/admin/gifts/:giftId', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json({ success: true, gift: await Gift.findByIdAndUpdate(req.params.giftId, req.body, { new: true }) });
});

app.delete('/api/admin/gifts/:giftId', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    await Gift.findByIdAndDelete(req.params.giftId);
    res.json({ success: true });
});

// ============ Games System ============

const userLossStreak = new Map();

app.post('/api/game/play', authenticate, async (req, res) => {
    const { gameId, betAmount } = req.body;
    const game = await Game.findById(gameId);
    if (!game) return res.status(404).json({ error: 'اللعبة غير موجودة' });
    if (!game.isActive) return res.status(400).json({ error: 'اللعبة غير متاحة' });
    if (betAmount < game.minBet || betAmount > game.maxBet) return res.status(400).json({ error: 'مبلغ الرهان غير صحيح' });
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

app.post('/api/admin/games', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const game = new Game(req.body);
    await game.save();
    res.json({ success: true, game });
});

app.get('/api/admin/games', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json(await Game.find());
});

app.put('/api/admin/games/:gameId', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json({ success: true, game: await Game.findByIdAndUpdate(req.params.gameId, req.body, { new: true }) });
});

// ============ Warnings System ============

app.post('/api/admin/warnings/add', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { userId, reason, action } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    user.warnings.push({ reason, date: new Date(), moderator: req.user.username, action: action || 'warn' });
    user.riskScore += 10;
    if (user.riskScore >= 100) { user.isBanned = true; user.banReason = 'تجاوز حد المخاطر التلقائي'; }
    else if (user.riskScore >= 70) user.mutedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
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
    if (index >= 0 && index < user.warnings.length) { user.warnings.splice(index, 1); user.riskScore = Math.max(0, user.riskScore - 10); await user.save(); }
    res.json({ success: true, riskScore: user.riskScore });
});

app.post('/api/moderation/check', authenticate, async (req, res) => {
    const { message } = req.body;
    const bannedWords = ['كلمة ممنوعة', 'سيء', 'بذيء'];
    const foundWord = bannedWords.find(word => message.toLowerCase().includes(word.toLowerCase()));
    if (foundWord) {
        req.user.warnings.push({ reason: `كلمة محظورة: ${foundWord}`, date: new Date(), moderator: 'AI System', action: 'warn' });
        req.user.riskScore += 5;
        if (req.user.riskScore >= 100) { req.user.isBanned = true; req.user.banReason = 'تجاوز حد المخاطر التلقائي'; }
        await req.user.save();
        return res.json({ blocked: true, reason: `الرسالة تحتوي على كلمة ممنوعة: ${foundWord}`, riskScore: req.user.riskScore });
    }
    res.json({ blocked: false });
});

// ============ Payments System ============

const PACKAGES = { '1000_coins': { price: 0.10, coins: 1000 }, '5000_coins': { price: 0.50, coins: 5000 }, '10000_coins': { price: 1.00, coins: 10000 }, '50000_coins': { price: 4.99, coins: 50000 }, '100000_coins': { price: 9.99, coins: 100000 } };

app.get('/api/packages', async (req, res) => {
    res.json(PACKAGES);
});

app.put('/api/admin/packages', authenticate, authorize(['super_admin']), async (req, res) => {
    res.json({ success: true });
});

app.post('/api/payment/purchase', authenticate, async (req, res) => {
    const { packageId } = req.body;
    const pkg = PACKAGES[packageId];
    if (!pkg) return res.status(400).json({ error: 'الباقة غير موجودة' });
    req.user.coins += pkg.coins;
    req.user.transactions.push({ type: 'purchase', amount: pkg.price, coins: pkg.coins, description: `شراء ${pkg.coins} عملة`, date: new Date(), status: 'completed' });
    await req.user.save();
    res.json({ success: true, newBalance: req.user.coins, message: `تم إضافة ${pkg.coins} عملة بنجاح` });
});

app.post('/api/payment/withdraw', authenticate, async (req, res) => {
    const { amount, method, accountInfo } = req.body;
    const dollarsFromDiamonds = Math.floor(req.user.diamonds / 15000);
    if (amount > dollarsFromDiamonds) return res.status(400).json({ error: 'رصيد غير كاف للسحب' });
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
    res.json({ success: true, message: 'تمت الموافقة على طلب السحب' });
});

// ============ Events & Splash Screen & Banners ============

app.get('/api/events/active', async (req, res) => {
    const now = new Date();
    res.json(await Event.find({ isActive: true, startDate: { $lte: now }, endDate: { $gte: now } }));
});

app.post('/api/admin/events', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const event = new Event(req.body);
    await event.save();
    res.json({ success: true, event });
});

app.get('/api/admin/events', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json(await Event.find().sort({ createdAt: -1 }));
});

app.delete('/api/admin/events/:id', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    await Event.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.get('/api/splash/active', async (req, res) => {
    const now = new Date();
    res.json(await SplashScreen.findOne({ isActive: true, startDate: { $lte: now }, endDate: { $gte: now } }) || null);
});

app.post('/api/admin/splash', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const splash = new SplashScreen(req.body);
    await splash.save();
    res.json({ success: true, splash });
});

app.get('/api/admin/splash', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json(await SplashScreen.find().sort({ createdAt: -1 }));
});

app.put('/api/admin/splash/:id', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json({ success: true, splash: await SplashScreen.findByIdAndUpdate(req.params.id, req.body, { new: true }) });
});

app.delete('/api/admin/splash/:id', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    await SplashScreen.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

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

// ============ Advanced Stats ============

app.get('/api/admin/advanced-stats', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const totalUsers = await User.countDocuments();
    const vipUsers = await User.countDocuments({ vipLevel: { $gt: 0 } });
    const totalCoins = await User.aggregate([{ $group: { _id: null, total: { $sum: "$coins" } } }]);
    const totalDiamonds = await User.aggregate([{ $group: { _id: null, total: { $sum: "$diamonds" } } }]);
    const totalGiftsSent = await User.aggregate([{ $group: { _id: null, total: { $sum: "$totalGiftsSent" } } }]);
    const bannedUsers = await User.countDocuments({ isBanned: true });
    res.json({ users: { totalUsers }, vip: { total: vipUsers }, finance: { totalCoins: totalCoins[0]?.total || 0, totalDiamonds: totalDiamonds[0]?.total || 0 }, gifts: { totalSent: totalGiftsSent[0]?.total || 0 }, moderation: { bannedUsers } });
});

// ============ Invitation Routes ============

app.post('/api/invitations/send-admin', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { targetUserId, targetUsername, createNewAgency } = req.body;
    let targetUser = null;
    if (targetUserId) targetUser = await User.findById(targetUserId);
    else if (targetUsername) targetUser = await User.findOne({ username: targetUsername });
    if (!targetUser) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (targetUser.role === 'admin' || targetUser.role === 'super_admin') return res.status(400).json({ error: 'المستخدم بالفعل Admin' });
    targetUser.role = 'admin';
    if (createNewAgency) {
        const newAgency = new Agency({ name: `${targetUser.username}_Agency`, ownerId: targetUser._id });
        await newAgency.save();
        targetUser.agencyId = newAgency._id;
    }
    await targetUser.save();
    res.json({ success: true, message: `تمت ترقية ${targetUser.username} إلى Admin بنجاح` });
});

// ============ Create Super Admin ============

const createSuperAdmin = async () => {
    const existing = await User.findOne({ role: 'super_admin' });
    if (!existing) {
        const hashedPassword = await bcrypt.hash('SuperAdmin123!', 10);
        await User.create({ username: 'SuperAdmin', email: 'superadmin@eaglevoice.com', password: hashedPassword, role: 'super_admin', coins: 999999, diamonds: 999999 });
        console.log('✅ Super Admin created');
    }
};

// ============ Start Server ============

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('❌ MONGODB_URI is not defined'); process.exit(1); }

mongoose.connect(MONGODB_URI, { dbName: 'eagle-voice-chat' })
    .then(async () => {
        console.log('✅ MongoDB connected');
        await createSuperAdmin();

        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`🦅 Eagle Voice Chat running on port ${PORT}`);
        });

        // Socket.IO
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
            console.log('✅ Socket:', socket.user.username);
            global.onlineUsers.set(socket.user._id.toString(), socket.id);

            socket.on('create-room', async (data, callback) => {
                try {
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
                io.to(`room:${data.roomId}`).emit('new-message', { username: socket.user.username, message: data.message, time: new Date() });
            });

            socket.on('disconnect', () => {
                global.onlineUsers.delete(socket.user._id.toString());
                console.log('❌ Socket disconnected:', socket.user.username);
            });
        });
    })
    .catch(err => { console.error('❌ MongoDB error:', err.message); process.exit(1); });
