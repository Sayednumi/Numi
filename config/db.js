const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/numi_local_db';
        console.log(`🔌 Attempting to connect to MongoDB...`);
        const conn = await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 20000,
            connectTimeoutMS: 20000,
        });
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
