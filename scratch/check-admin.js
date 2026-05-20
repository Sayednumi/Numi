require('dotenv').config();
const mongoose = require('mongoose');

async function findAdminAndTest() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB\n');

        const User = require('../models/User');

        // Find super admin
        const admin = await User.findOne({ role: 'super_admin' }).lean();
        if (admin) {
            console.log('Found super_admin:', admin.name, '| phone:', admin.phone);
            console.log('Password (first 10):', admin.password?.substring(0, 10));
            console.log('Is bcrypt hash?', admin.password?.startsWith('$2'));
        }

        // Count all users
        const total = await User.countDocuments();
        const byRole = await User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]);
        console.log('\nTotal users in DB:', total);
        console.log('By role:', JSON.stringify(byRole));

        await mongoose.disconnect();
    } catch(e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

findAdminAndTest();
