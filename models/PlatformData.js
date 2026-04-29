const mongoose = require('mongoose');

const PlatformDataSchema = new mongoose.Schema({
  docId: { type: String, default: 'main', unique: true },
  data: { type: mongoose.Schema.Types.Mixed, default: { classes: {} } }
}, { timestamps: true });

module.exports = mongoose.model('PlatformData', PlatformDataSchema);
