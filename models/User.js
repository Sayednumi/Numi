const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['student', 'teacher', 'admin', 'manager', 'super_admin'], default: 'student' },
  tenantId: { type: String, default: 'main' },
  status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'inactive' },
  permissions: { type: mongoose.Schema.Types.Mixed, default: {} },
  deviceId: { type: String, default: '' },
  lastLoginAt: { type: Date },
  xp: { type: Number, default: 0 },
  streak: { type: Number, default: 0 },
  avatar: { type: String, default: '' },
  classId: { type: String, default: '' },
  groupId: { type: String, default: '' },
  parentPhone: { type: String, default: '' },
  school: { type: String, default: '' }
}, { timestamps: true });

// Hash password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
