/**
 * ─── Numi Admin Account Setup ───────────────────────────────────────
 * Run this script ONCE after deployment to create the admin account.
 * Usage: node create-admin.js
 * ─────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌ MONGO_URI not found in .env file!');
  process.exit(1);
}

const UserSchema = new mongoose.Schema({
  id:       { type: String, unique: true, required: true },
  name:     { type: String, required: true },
  phone:    { type: String, unique: true, required: true },
  password: { type: String, default: '' },
  role:     { type: String, default: 'student' },
  status:   { type: String, default: 'inactive' },
}, { timestamps: true });
const User = mongoose.model('User', UserSchema);

// ─── Admin Credentials ───────────────────────────────────────────────
const ADMIN = {
  id:       'admin',
  name:     'المدير العام',
  phone:    '01099999999',
  password: 'Numi@2026',
  role:     'admin',
  status:   'active',
  permissions: { isOwner: true }
};
// ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('🔌 Connecting to MongoDB Atlas...');
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 20000 });
    console.log('✅ Connected!');

    await User.updateOne({ id: ADMIN.id }, { $set: ADMIN }, { upsert: true });
    console.log('\n✅ Admin account created/updated successfully!\n');
    console.log('╔═══════════════════════════════╗');
    console.log('║    📱 رقم التليفون             ║');
    console.log(`║    ${ADMIN.phone}          ║`);
    console.log('╠═══════════════════════════════╣');
    console.log('║    🔑 كلمة المرور              ║');
    console.log(`║    ${ADMIN.password}              ║`);
    console.log('╚═══════════════════════════════╝\n');
    console.log('الدور: مدير (admin) | الحالة: نشط (active)');

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB.');
    process.exit(0);
  }
}

run();
