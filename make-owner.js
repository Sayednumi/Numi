require('dotenv').config();
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true },
  name:        { type: String, required: true },
  phone:       { type: String, required: true },
  password:    { type: String, required: true },
  role:        { type: String, default: 'student' },
  permissions: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { strict: false });

const User = mongoose.model('User', UserSchema);

async function run() {
    try {
        if (!process.env.MONGO_URI) {
            console.error("No MONGO_URI found in .env");
            process.exit(1);
        }
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to Database.");
        
        const phoneNum = "01110154093";
        let user = await User.findOne({ phone: phoneNum });
        if (!user) {
            user = await User.findOne({ id: phoneNum });
        }
        
        if (!user) {
            console.error(`User with phone ${phoneNum} not found.`);
            process.exit(1);
        }
        
        user.role = 'admin';
        user.permissions = user.permissions || {};
        user.permissions.isOwner = true;
        user.permissions.manage_admins = true;
        user.permissions.manage_structure = true;
        user.permissions.manage_lessons = true;
        user.permissions.view_students = true;
        user.permissions.edit_student = true;
        user.permissions.delete_student = true;
        user.permissions.view_qbank = true;
        user.permissions.view_reports = true;
        
        user.markModified('permissions');
        await user.save();
        
        console.log(`✅ Successfully updated user "${user.name}" (${user.phone}) to System Owner!`);
    } catch(e) {
        console.error(e);
    } finally {
        mongoose.connection.close();
    }
}

run();
