require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('client'));

console.log('🚀 Starting Eagle Voice Chat Server...');
console.log('PORT:', process.env.PORT || 3000);
console.log('MONGODB_URI:', process.env.MONGODB_URI ? '✅ Defined' : '❌ Missing');

// ============ Models ============
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    email: { type: String, unique: true, sparse: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin', 'super_admin'], default: 'user' },
    coins: { type: Number, default: 0 },
    diamonds: { type: Number, default: 0 },
    vipLevel: { type: Number, default: 0 },
    isBanned: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const RoomSchema = new mongoose.Schema({
    name: { type: String, required: true },
    ownerId: { type: String, required: true },
    users: [{ userId: String, joinedAt: Date }],
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Room = mongoose.model('Room', RoomSchema);

// ============ API Routes ============
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, email, password: hashedPassword });
        await user.save();
        
        const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET);
        
        res.json({ 
            success: true, 
            token, 
            user: { 
                id: user._id, 
                username: user.username, 
                role: user.role, 
                coins: user.coins, 
                diamonds: user.diamonds 
            } 
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await User.findOne({ username });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        }
        
        if (user.isBanned) {
            return res.status(403).json({ error: 'الحساب محظور' });
        }
        
        const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET);
        
        res.json({ 
            success: true, 
            token, 
            user: { 
                id: user._id, 
                username: user.username, 
                role: user.role, 
                coins: user.coins, 
                diamonds: user.diamonds, 
                vipLevel: user.vipLevel 
            } 
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/user', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token' });
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');
        
        res.json({ user });
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

app.get('/api/rooms', async (req, res) => {
    try {
        const rooms = await Room.find().sort({ createdAt: -1 });
        res.json(rooms);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ Socket.IO ============
const server = http.createServer(app);
const io = socketIo(server, { 
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error('No token'));
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user || user.isBanned) return next(new Error('Unauthorized'));
        
        socket.user = user;
        next();
    } catch (err) {
        next(new Error('Auth failed'));
    }
});

io.on('connection', (socket) => {
    console.log('✅ Connected:', socket.user.username);
    
    socket.on('create-room', async (data, callback) => {
        try {
            const room = new Room({ 
                name: data.name, 
                ownerId: socket.user._id 
            });
            await room.save();
            
            socket.join(`room:${room._id}`);
            callback({ success: true, room });
            io.emit('rooms-updated');
        } catch (error) {
            callback({ error: error.message });
        }
    });
    
    socket.on('join-room', async (data, callback) => {
        try {
            socket.join(`room:${data.roomId}`);
            callback({ success: true });
            socket.to(`room:${data.roomId}`).emit('user-joined', socket.user.username);
        } catch (error) {
            callback({ error: error.message });
        }
    });
    
    socket.on('send-message', (data) => {
        io.to(`room:${data.roomId}`).emit('new-message', {
            username: socket.user.username,
            message: data.message,
            time: new Date()
        });
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Disconnected:', socket.user.username);
    });
});

// ============ Create Super Admin ============
const createSuperAdmin = async () => {
    try {
        const existing = await User.findOne({ role: 'super_admin' });
        if (!existing) {
            const hashedPassword = await bcrypt.hash('SuperAdmin123!', 10);
            await User.create({
                username: 'SuperAdmin',
                email: 'superadmin@eaglevoice.com',
                password: hashedPassword,
                role: 'super_admin',
                coins: 999999,
                diamonds: 999999
            });
            console.log('✅ Super Admin created: superadmin@eaglevoice.com / SuperAdmin123!');
        }
    } catch (error) {
        console.error('Error creating Super Admin:', error.message);
    }
};

// ============ Start Server ============
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not defined in environment variables');
    process.exit(1);
}

mongoose.connect(MONGODB_URI, {
    dbName: 'eagle-voice-chat'
})
.then(async () => {
    console.log('✅ MongoDB connected successfully');
    await createSuperAdmin();
    server.listen(PORT, () => {
        console.log(`🦅 Eagle Voice Chat running on port ${PORT}`);
        console.log(`📱 Open: http://localhost:${PORT}`);
    });
})
.catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
});
