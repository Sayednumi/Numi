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

// Indexing for performance (phone is already unique:true in schema, so no extra index needed)
UserSchema.index({ role: 1 });
UserSchema.index({ tenantId: 1 });

// Hash password before saving
UserSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    if (!this.password) {
        return next();
    }

    // Only hash if it is not already a bcrypt hash (starts with $2a$ or $2b$)
    if (this.password.startsWith('$2a$') || this.password.startsWith('$2b$')) {
        return next();
    }

    try {
        const bcrypt = require('bcryptjs');
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err);
    }
});

UserSchema.methods.matchPassword = async function (enteredPassword) {
    if (!this.password) return false;
    
    // Check if the stored password starts with a bcrypt prefix ($2a$ or $2b$)
    if (this.password.startsWith('$2a$') || this.password.startsWith('$2b$')) {
        const bcrypt = require('bcryptjs');
        return await bcrypt.compare(enteredPassword, this.password);
    }
    
    // Fallback for legacy plain-text passwords
    return enteredPassword === this.password;
};

module.exports = mongoose.model('User', UserSchema);
