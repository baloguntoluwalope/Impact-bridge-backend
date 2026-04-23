'use strict';

const SDG      = require('./sdg.model');
const Content  = require('./sdgContent.model');
const Request  = require('../requests/request.model');
const { getRedisClient } = require('../../config/redis');
const { paginate, paginationMeta } = require('../../utils/helpers');
const ApiError = require('../../utils/apiError');

const SDG_SEED_DATA = [
  { number: 1,  category: 'no_poverty',              title: 'No Poverty',                              description: 'End poverty in all its forms everywhere.',                                        color: '#E5243B', icon: '🌍' },
  { number: 2,  category: 'zero_hunger',             title: 'Zero Hunger',                             description: 'End hunger, achieve food security and improved nutrition.',                       color: '#DDA63A', icon: '🌾' },
  { number: 3,  category: 'good_health',             title: 'Good Health and Well-Being',              description: 'Ensure healthy lives and promote well-being for all at all ages.',                 color: '#4C9F38', icon: '🏥' },
  { number: 4,  category: 'quality_education',       title: 'Quality Education',                       description: 'Ensure inclusive and equitable quality education for all.',                       color: '#C5192D', icon: '📚' },
  { number: 5,  category: 'gender_equality',         title: 'Gender Equality',                         description: 'Achieve gender equality and empower all women and girls.',                        color: '#FF3A21', icon: '⚖️' },
  { number: 6,  category: 'clean_water',             title: 'Clean Water and Sanitation',              description: 'Ensure availability and sustainable management of water for all.',                 color: '#26BDE2', icon: '💧' },
  { number: 7,  category: 'affordable_energy',       title: 'Affordable and Clean Energy',             description: 'Ensure access to affordable, reliable, sustainable modern energy.',               color: '#FCC30B', icon: '⚡' },
  { number: 8,  category: 'decent_work',             title: 'Decent Work and Economic Growth',         description: 'Promote sustained, inclusive and sustainable economic growth.',                    color: '#A21942', icon: '💼' },
  { number: 9,  category: 'industry_innovation',     title: 'Industry, Innovation and Infrastructure', description: 'Build resilient infrastructure, promote inclusive industrialization.',             color: '#FD6925', icon: '🏗️' },
  { number: 10, category: 'reduced_inequalities',    title: 'Reduced Inequalities',                    description: 'Reduce inequality within and among countries.',                                   color: '#DD1367', icon: '🤝' },
  { number: 11, category: 'sustainable_cities',      title: 'Sustainable Cities and Communities',      description: 'Make cities inclusive, safe, resilient and sustainable.',                         color: '#FD9D24', icon: '🏙️' },
  { number: 12, category: 'responsible_consumption', title: 'Responsible Consumption and Production',  description: 'Ensure sustainable consumption and production patterns.',                          color: '#BF8B2E', icon: '♻️' },
  { number: 13, category: 'climate_action',          title: 'Climate Action',                          description: 'Take urgent action to combat climate change and its impacts.',                    color: '#3F7E44', icon: '🌿' },
  { number: 14, category: 'life_below_water',        title: 'Life Below Water',                        description: 'Conserve and sustainably use the oceans, seas and marine resources.',             color: '#0A97D9', icon: '🐠' },
  { number: 15, category: 'life_on_land',            title: 'Life on Land',                            description: 'Protect, restore and promote sustainable use of terrestrial ecosystems.',         color: '#56C02B', icon: '🌳' },
  { number: 16, category: 'peace_justice',           title: 'Peace, Justice and Strong Institutions',  description: 'Promote peaceful and inclusive societies and access to justice.',                  color: '#00689D', icon: '⚖️' },
  { number: 17, category: 'partnerships',            title: 'Partnerships for the Goals',              description: 'Strengthen the means of implementation and revitalize global partnerships.',       color: '#19486A', icon: '🤝' },
];

const cacheGet = async (key, ttl, fn) => {
  const redis  = getRedisClient();
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const data = await fn();
  await redis.setEx(key, ttl, JSON.stringify(data));
  return data;
};

const seedSDGs = async () => {
  for (const sdg of SDG_SEED_DATA) {
    await SDG.findOneAndUpdate({ number: sdg.number }, sdg, { upsert: true, new: true });
  }
  const redis = getRedisClient();
  await redis.del('sdg:all');
  return { seeded: SDG_SEED_DATA.length };
};

const getAllSDGs = async () =>
  cacheGet('sdg:all', 600, () => SDG.find({ is_active: true }).sort('number').lean());

const getSDGByNumber = async (number) => {
  const n = parseInt(number);
  return cacheGet(`sdg:detail:${n}`, 600, async () => {
    const sdg = await SDG.findOne({ number: n }).lean();
    if (!sdg) throw ApiError.notFound(`SDG ${n} not found`);

    const [contentCount, caseCount, stats] = await Promise.all([
      Content.countDocuments({ sdg_number: n, is_published: true }),
      Request.countDocuments({ sdg_number: n, status: 'verified', is_visible: true }),
      Request.aggregate([
        { $match: { sdg_number: n, status: { $in: ['verified','funded','in_progress','completed'] } } },
        { $group: { _id: null, total_needed: { $sum: '$amount_needed' }, total_raised: { $sum: '$amount_raised' }, beneficiaries: { $sum: '$beneficiaries_count' } } },
      ]),
    ]);

    return { ...sdg, content_count: contentCount, active_cases: caseCount, stats: stats[0] || {} };
  });
};

const getSDGContent = async (sdgNumber, query) => {
  const { page, limit, content_type, target_audience, language } = query;
  const { page: p, limit: l, skip } = paginate(page, limit);
  const n = parseInt(sdgNumber);

  const filter = { sdg_number: n, is_published: true };
  if (content_type)    filter.content_type    = content_type;
  if (target_audience) filter.target_audience = { $in: [target_audience, 'all'] };
  if (language)        filter.language        = language;

  const cacheKey = `sdg:content:${n}:${JSON.stringify(filter)}:${p}:${l}`;
  return cacheGet(cacheKey, 300, async () => {
    const [content, total] = await Promise.all([
      Content.find(filter).populate('created_by', 'first_name last_name').sort('-created_at').skip(skip).limit(l).lean(),
      Content.countDocuments(filter),
    ]);
    return { content, pagination: paginationMeta(total, p, l) };
  });
};

const createContent = async (adminId, body) => {
  const sdg = await SDG.findOne({ number: parseInt(body.sdg_number) });
  if (!sdg) throw ApiError.notFound('SDG not found');

  const content = await Content.create({
    ...body,
    sdg:          sdg._id,
    sdg_number:   sdg.number,
    created_by:   adminId,
    ...(body.is_published && { published_at: new Date() }),
  });

  const redis = getRedisClient();
  const keys  = await redis.keys(`sdg:content:${sdg.number}:*`);
  if (keys.length) await redis.del(keys);
  await redis.del(`sdg:detail:${sdg.number}`);

  return content;
};

const updateContent = async (contentId, body) => {
  const existing = await Content.findById(contentId);
  if (!existing) throw ApiError.notFound('Content not found');

  if (body.is_published && !existing.is_published) {
    body.published_at = new Date();
  }

  const updated = await Content.findByIdAndUpdate(contentId, body, { new: true, runValidators: true });

  const redis = getRedisClient();
  const keys  = await redis.keys(`sdg:content:${existing.sdg_number}:*`);
  if (keys.length) await redis.del(keys);

  return updated;
};

const deleteContent = async (contentId) => {
  const content = await Content.findByIdAndDelete(contentId);
  if (!content) throw ApiError.notFound('Content not found');

  const redis = getRedisClient();
  const keys  = await redis.keys(`sdg:content:${content.sdg_number}:*`);
  if (keys.length) await redis.del(keys);

  return { deleted: true };
};

const trackView = async (contentId) => {
  await Content.findByIdAndUpdate(contentId, { $inc: { views: 1 } });
};

const getNationalAnalytics = async () =>
  cacheGet('sdg:national:analytics', 300, async () => {
    const [cases, contentStats] = await Promise.all([
      Request.aggregate([
        { $match: { status: { $in: ['verified','funded','in_progress','completed'] } } },
        { $group: { _id: { sdg: '$sdg_number', cat: '$category' }, cases: { $sum: 1 }, needed: { $sum: '$amount_needed' }, raised: { $sum: '$amount_raised' }, beneficiaries: { $sum: '$beneficiaries_count' }, completed: { $sum: { $cond: [{ $eq: ['$status','completed'] }, 1, 0] } } } },
        { $sort: { '_id.sdg': 1 } },
      ]),
      Content.aggregate([
        { $match: { is_published: true } },
        { $group: { _id: '$sdg_number', content: { $sum: 1 }, views: { $sum: '$views' } } },
        { $sort: { _id: 1 } },
      ]),
    ]);
    return { cases, contentStats };
  });

module.exports = {
  seedSDGs,
  getAllSDGs,
  getSDGByNumber,
  getSDGContent,
  createContent,
  updateContent,
  deleteContent,
  trackView,
  getNationalAnalytics,
};