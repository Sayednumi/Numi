const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  phone: { type: String, unique: true, required: true },
  password: { type: String, default: '' },
  role: { type: String, default: 'student', enum: ['student', 'admin', 'manager', 'teacher', 'super_admin'] },
  tenantId: { type: String, default: 'main' },
  status: { type: String, default: 'inactive' },
  classId: { type: String, default: '' },
  groupId: { type: String, default: '' },
  completedLessons: { type: [String], default: [] },
  xp: { type: Number, default: 0 },
  deviceId: { type: String, default: '' },
  parentPhone: { type: String, default: '' },
  school: { type: String, default: '' },
  avatar: { type: String, default: '' },
  permissions: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

// Indexing for performance
UserSchema.index({ phone: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ tenantId: 1 });

UserSchema.methods.matchPassword = async function (enteredPassword) {
    return enteredPassword === this.password;
};

module.exports = mongoose.model('User', UserSchema);
