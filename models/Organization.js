const mongoose = require('mongoose');

const OrganizationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['school', 'academy', 'individual'], required: true },
  adminId: { type: String }, 
  address: { type: String },
  country: { type: String, default: 'Egypt' },
  subscriptionPlan: { type: String, enum: ['free', 'basic', 'pro'], default: 'free' },
  subscriptionStatus: { type: String, enum: ['active', 'expired', 'trial'], default: 'trial' },
  subscriptionExpiresAt: { type: Date },
  aiUsageLimitPerMonth: { type: Number, default: 50 },
  aiUsageCurrentMonth: { type: Number, default: 0 },
  onboardingStatus: { type: String, enum: ['pending', 'active', 'completed'], default: 'pending' },
  numberOfTeachers: { type: Number, default: 0 },
  numberOfStudents: { type: Number, default: 0 },
  lastActivityAt: { type: Date, default: Date.now },
  aiTeacherConfig: {
    enabled: { type: Boolean, default: true },
    strictMode: { type: Boolean, default: true },
    personality: { type: String, default: 'professional' },
    customInstructions: { type: String, default: '' }
  }
}, { timestamps: true });

module.exports = mongoose.model('Organization', OrganizationSchema);
