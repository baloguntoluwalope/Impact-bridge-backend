'use strict';

const mongoose = require('mongoose');

const sdgSchema = new mongoose.Schema({
  number:       { type: Number, required: true, unique: true, min: 1, max: 17 },
  category:     { type: String, required: true, unique: true },
  title:        { type: String, required: true },
  description:  { type: String, required: true },
  color:        { type: String, required: true },
  icon:         { type: String },
  official_url: { type: String },
  is_active:    { type: Boolean, default: true },
}, { timestamps: true });

// sdgSchema.index({ number: 1 }, { unique: true });
// sdgSchema.index({ category: 1 }, { unique: true });

module.exports = mongoose.model('SDG', sdgSchema);