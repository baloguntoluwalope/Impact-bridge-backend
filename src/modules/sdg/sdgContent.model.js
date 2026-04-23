'use strict';

const mongoose = require('mongoose');

/**
 * SDGContent — dynamic CMS model.
 * Admins can continuously add educational content per SDG.
 * Content can be text, video, audio, PDF, infographic or quiz.
 * Supports multiple languages (en, ha, yo, ig).
 * target_audience allows filtering content by viewer type.
 */
const sdgContentSchema = new mongoose.Schema({
  sdg:             { type: mongoose.Schema.Types.ObjectId, ref: 'SDG', required: true },
  sdg_number:      { type: Number, required: true, min: 1, max: 17 },
  title:           { type: String, required: true, trim: true, maxlength: 200 },
  body:            { type: String, required: true },
  content_type:    { type: String, enum: ['text','video','audio','pdf','infographic','quiz'], required: true },
  media_url:       { type: String },
  target_audience: { type: String, enum: ['all','students','teachers','community','ngo','government','donor'], default: 'all' },
  is_published:    { type: Boolean, default: false },
  published_at:    { type: Date },
  created_by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  views:           { type: Number, default: 0 },
  tags:            [{ type: String }],
  student_actions: [{ type: String }],
  examples:        [{ type: String }],
  club_activity:   { type: String },
  read_time:       { type: Number, default: 3 },
  language:        { type: String, enum: ['en','ha','yo','ig'], default: 'en' },
}, { timestamps: true });

sdgContentSchema.index({ sdg_number: 1, is_published: 1 });
sdgContentSchema.index({ target_audience: 1 });
sdgContentSchema.index({ content_type: 1 });
sdgContentSchema.index({ is_published: 1, created_at: -1 });
sdgContentSchema.index({ language: 1 });

module.exports = mongoose.model('SDGContent', sdgContentSchema);