const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  performedBy: { type: String, required: true },
  targetOrganization: { type: String, index: true },
  details: { type: String },
  ipAddress: { type: String },
  userAgent: { type: String }
}, { timestamps: true });

AuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
