require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('✅ Eagle Voice Chat Server is Alive!');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server is running successfully on port ${PORT}`);
    console.log(`✅ MONGODB_URI is ${process.env.MONGODB_URI ? 'defined' : 'NOT defined'}`);
    console.log(`✅ JWT_SECRET is ${process.env.JWT_SECRET ? 'defined' : 'NOT defined'}`);
});
