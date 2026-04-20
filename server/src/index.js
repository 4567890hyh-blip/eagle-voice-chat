require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

/* ================= DB ================= */

mongoose.connect(process.env.MONGODB_URI)
.then(()=>console.log("✅ Mongo connected"))
.catch(err=>console.log(err));

/* ================= MODELS ================= */

const User = mongoose.model('User', new mongoose.Schema({
    username: String,
    password: String,
    avatar: { type:String, default:"" }
}));

const Room = mongoose.model('Room', new mongoose.Schema({
    name: String,
    ownerId: String,
    users: [String],
    currentSpeakers: [String],
    maxMicrophones: { type:Number, default:5 },
    isMicsLocked: { type:Boolean, default:false }
}));

/* ================= AUTH ================= */

const genToken = id => jwt.sign({id}, process.env.JWT_SECRET);

const auth = async (req,res,next)=>{
    try{
        const token = req.headers.authorization?.split(" ")[1];
        const data = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(data.id);
        next();
    }catch{
        res.status(401).json({error:"unauthorized"});
    }
};

/* ================= API ================= */

app.post('/api/register', async (req,res)=>{
    const {username,password} = req.body;

    const hash = await bcrypt.hash(password,10);

    const user = await User.create({username,password:hash});

    res.json({success:true});
});

app.post('/api/login', async (req,res)=>{
    const {username,password} = req.body;

    const user = await User.findOne({username});
    if(!user) return res.json({error:"no user"});

    const ok = await bcrypt.compare(password,user.password);
    if(!ok) return res.json({error:"wrong"});

    const token = genToken(user._id);

    res.json({success:true,token});
});

app.get('/api/rooms', async (req,res)=>{
    const rooms = await Room.find();
    res.json(rooms);
});

/* ================= SOCKET ================= */

global.rtcRooms = {};

io.use(async (socket,next)=>{
    try{
        const token = socket.handshake.auth.token;
        const data = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = await User.findById(data.id);
        next();
    }catch{
        next(new Error("unauthorized"));
    }
});

io.on('connection', (socket)=>{

    console.log("🔥 connected:", socket.user.username);

    /* ===== ROOMS ===== */

    socket.on('create-room', async ({name})=>{
        const room = await Room.create({
            name,
            ownerId: socket.user._id,
            users: [],
            currentSpeakers:[]
        });

        io.emit("rooms-updated");
    });

    socket.on('join-room', async ({roomId})=>{
        socket.join(roomId);

        const room = await Room.findById(roomId);

        if(!room.users.includes(socket.user._id.toString())){
            room.users.push(socket.user._id);
            await room.save();
        }
    });

    /* ===== CHAT ===== */

    socket.on('msg', ({roomId,text})=>{
        io.to(roomId).emit('msg', socket.user.username + ": " + text);
    });

    /* ===== MIC ===== */

    socket.on('request-mic', async ({roomId},cb)=>{
        const room = await Room.findById(roomId);

        if(room.isMicsLocked && room.ownerId != socket.user._id)
            return cb({error:"locked"});

        if(room.currentSpeakers.length >= room.maxMicrophones)
            return cb({error:"full"});

        room.currentSpeakers.push(socket.user._id);
        await room.save();

        cb({success:true});
    });

    socket.on('remove-speaker', async ({roomId})=>{
        const room = await Room.findById(roomId);

        room.currentSpeakers = room.currentSpeakers.filter(
            id => id.toString() !== socket.user._id.toString()
        );

        await room.save();
    });

    /* ===== WEBRTC ===== */

    socket.on('webrtc-join', ({roomId})=>{
        if(!global.rtcRooms[roomId]) global.rtcRooms[roomId] = [];

        const others = global.rtcRooms[roomId].filter(id=>id!==socket.id);

        socket.emit('webrtc-users', others);

        global.rtcRooms[roomId].push(socket.id);
    });

    socket.on('webrtc-offer', ({to,offer})=>{
        io.to(to).emit('webrtc-offer',{
            from:socket.id,
            offer
        });
    });

    socket.on('webrtc-answer', ({to,answer})=>{
        io.to(to).emit('webrtc-answer',{
            from:socket.id,
            answer
        });
    });

    socket.on('webrtc-candidate', ({to,candidate})=>{
        io.to(to).emit('webrtc-candidate',{
            from:socket.id,
            candidate
        });
    });

    /* ===== DISCONNECT ===== */

    socket.on('disconnect', ()=>{
        for(let r in global.rtcRooms){
            global.rtcRooms[r] =
                global.rtcRooms[r].filter(id=>id!==socket.id);
        }

        console.log("❌ disconnected");
    });

});

/* ================= START ================= */

server.listen(process.env.PORT, ()=>{
    console.log("🚀 running on port", process.env.PORT);
});
