'use strict';

/**
 * ai.verification.service.js
 *
 * Uses THREE AI providers in parallel for every analysis:
 *   1. Anthropic Claude  (claude-sonnet-4-6)
 *   2. OpenAI GPT-4o     (gpt-4o)
 *   3. Google Gemini     (gemini-1.5-pro)
 *
 * Each provider independently scores the request.
 * Results are then merged into a CONSENSUS verdict:
 *   - Scores are averaged across providers
 *   - Flags are unioned (any flag from any model is kept)
 *   - Recommendation requires agreement from at least 2/3 models
 *   - Per-provider breakdown is returned so admin can see disagreements
 *
 * If one provider fails (e.g. rate limit, outage), the remaining
 * two still produce a result — partial consensus is flagged clearly.
 */

const axios           = require('axios');
const Request         = require('../requests/request.model');
const User            = require('../users/user.model');
const NgoAssignment   = require('../assignments/Ngo.assignment.model');
const NgoVerification = require('../ngos/ngo.verification.model');
const { getRedisClient } = require('../../config/redis');
const ApiError        = require('../../utils/apiError');

/* ─────────────────────────────────────────────────────────────
   RETRY HELPER WITH EXPONENTIAL BACKOFF
───────────────────────────────────────────────────────────── */
const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = err.message.includes('rate limited') || err.message.includes('429');
      if (!isRateLimit || attempt === maxRetries) {
        throw err;
      }
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000; // jitter
      console.log(`[AI] Rate limited, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

/* ─────────────────────────────────────────────────────────────
   PROVIDER 1 — ANTHROPIC CLAUDE
───────────────────────────────────────────────────────────── */
const callClaude = async (systemPrompt, userPrompt) => {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  return retryWithBackoff(async () => {
    try {
      const res = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model:      'claude-sonnet-4-6',
          max_tokens: 1200,
          system:     systemPrompt,
          messages:   [{ role: 'user', content: userPrompt }],
        },
        {
          headers: {
            'x-api-key':         process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type':      'application/json',
          },
          timeout: 30000,
        }
      );
      return parseJson(res.data.content[0].text, 'Claude');
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        throw new Error(`Claude auth failed (${status}): Invalid or expired API key`);
      }
      if (status === 429) {
        throw new Error(`Claude rate limited (429): Too many requests`);
      }
      throw new Error(`Claude error (${status || 'unknown'}): ${err.message}`);
    }
  });
};

/* ─────────────────────────────────────────────────────────────
   PROVIDER 2 — OPENAI GPT-4o
───────────────────────────────────────────────────────────── */
const callOpenAI = async (systemPrompt, userPrompt) => {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  return retryWithBackoff(async () => {
    try {
      const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model:       'gpt-4o',
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt },
          ],
        },
        {
          headers: {
            Authorization:  `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );
      return parseJson(res.data.choices[0].message.content, 'OpenAI');
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        throw new Error(`OpenAI auth failed (${status}): Invalid or expired API key`);
      }
      if (status === 429) {
        throw new Error(`OpenAI rate limited (429): Try again in a moment`);
      }
      throw new Error(`OpenAI error (${status || 'unknown'}): ${err.message}`);
    }
  });
};

/* ─────────────────────────────────────────────────────────────
   PROVIDER 3 — GOOGLE GEMINI
───────────────────────────────────────────────────────────── */
const callGemini = async (systemPrompt, userPrompt) => {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  return retryWithBackoff(async () => {
    try {
      const model = 'gemini-2.0-flash';

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const res     = await axios.post(
          url,
          {
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature:       0.1,
            },
          },
          { timeout: 30000 }
        );
        const text = res.data.candidates[0].content.parts[0].text;
        return parseJson(text, 'Gemini');
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        throw new Error(`Gemini auth failed (${status}): Invalid or expired API key`);
      }
      if (status === 404) {
        throw new Error(`Gemini 404: Invalid model name or endpoint. Check Gemini API documentation.`);
      }
      if (status === 429) {
        throw new Error(`Gemini rate limited (429): Try again in a moment`);
      }
      throw new Error(`Gemini error (${status || 'unknown'}): ${err.message}`);
    }
  });
};

/* ─────────────────────────────────────────────────────────────
   JSON PARSE HELPER
───────────────────────────────────────────────────────────── */
const parseJson = (text, provider) => {
  try {
    return JSON.parse(text.replace(/```json\n?|```/g, '').trim());
  } catch {
    throw new Error(`${provider} returned invalid JSON: ${text.slice(0, 200)}`);
  }
};

/* ─────────────────────────────────────────────────────────────
   CALL AVAILABLE PROVIDERS IN PARALLEL  (graceful partial failure)
   Only calls providers with valid API keys configured.
───────────────────────────────────────────────────────────── */
const callAllProviders = async (systemPrompt, userPrompt) => {
  /* Check which providers have valid API keys */
  const availableProviders = [];
  const providerFns = {};

  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    availableProviders.push('claude');
    providerFns['claude'] = () => callClaude(systemPrompt, userPrompt);
  }
  if (process.env.OPENAI_API_KEY?.trim()) {
    availableProviders.push('openai');
    providerFns['openai'] = () => callOpenAI(systemPrompt, userPrompt);
  }
  if (process.env.GEMINI_API_KEY?.trim()) {
    availableProviders.push('gemini');
    providerFns['gemini'] = () => callGemini(systemPrompt, userPrompt);
  }

  if (availableProviders.length === 0) {
    throw new Error('No AI providers configured. Please set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY.');
  }

  console.log(`[AI] Calling ${availableProviders.length} available provider(s): ${availableProviders.join(', ')}`);

  const results = await Promise.allSettled(
    availableProviders.map(p => providerFns[p]())
  );

  const successes = [];
  const failures  = [];

  results.forEach((r, i) => {
    const provider = availableProviders[i];
    if (r.status === 'fulfilled') {
      successes.push({ provider, data: r.value });
      console.log(`[AI] ${provider} succeeded`);
    } else {
      const errorMsg = r.reason?.message || 'Unknown error';
      failures.push({ provider, error: errorMsg });
      console.error(`[AI] ${provider} failed: ${errorMsg}`);
    }
  });

  if (successes.length === 0) {
    const failureDetails = failures.map(f => `${f.provider}: ${f.error}`).join('; ');
    throw new Error(`All ${availableProviders.length} available provider(s) failed: ${failureDetails}`);
  }

  return { successes, failures };
};

/* ─────────────────────────────────────────────────────────────
   FALLBACK ANALYSIS (when all providers fail)
   Returns neutral scores and flags the analysis as unavailable
───────────────────────────────────────────────────────────── */
const buildFallbackAnalysis = (failureReason) => {
  return {
    /* Neutral scores (unable to assess) */
    risk_score:   50,
    trust_score:  50,
    confidence:   0,

    /* No recommendation without AI input */
    recommendation:          'needs_review',
    recommendation_agreement: 'none',

    /* Flags that AI was unavailable */
    flags: [
      'AI_ANALYSIS_UNAVAILABLE',
      'MANUAL_REVIEW_REQUIRED',
      failureReason.includes('rate') ? 'RATE_LIMITED' : null,
      failureReason.includes('404') ? 'GEMINI_ENDPOINT_ERROR' : null,
    ].filter(Boolean),

    /* Detailed analysis blocked */
    text_analysis:           { status: 'unavailable', reason: failureReason },
    document_analysis:       { status: 'unavailable' },
    image_analysis:          { status: 'unavailable' },
    financial_analysis:      { status: 'unavailable' },
    user_risk:               { status: 'unavailable' },
    verification_status:     { status: 'pending_manual_review', ai_available: false },

    /* Transparency */
    admin_notes: `AI analysis unavailable: ${failureReason}. Manual review required.`,
    _providers: {
      used:              [],
      failed:            ['claude', 'openai', 'gemini'],
      count_used:        0,
      partial_consensus: false,
      individual_scores: [],
    },
  };
};

/* ─────────────────────────────────────────────────────────────
   CONSENSUS ENGINE
   Merges scores from 2-3 providers into one final result
───────────────────────────────────────────────────────────── */
const buildConsensus = (successes, failures) => {
  const results = successes.map(s => s.data);
  const count   = results.length;

  /* Average numeric scores */
  const avg = (field) =>
    Math.round(results.reduce((s, r) => s + (Number(r[field]) || 0), 0) / count);

  /* Union all flags / issues arrays (deduplicated) */
  const union = (field) =>
    [...new Set(results.flatMap(r => r[field] || []))];

  /* Majority vote on string recommendation */
  const vote = (field) => {
    const tally = {};
    results.forEach(r => {
      const val = r[field];
      if (val) tally[val] = (tally[val] || 0) + 1;
    });
    return Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  };

  /* Majority vote on boolean */
  const voteBool = (path) => {
    const trueCount = results.filter(r => {
      const parts = path.split('.');
      let val = r;
      for (const p of parts) val = val?.[p];
      return val === true;
    }).length;
    return trueCount > count / 2;
  };

  /* Did all/most models agree? */
  const agreementLevel = (field) => {
    const values = results.map(r => r[field]).filter(Boolean);
    const unique  = new Set(values);
    if (unique.size === 1) return 'full';
    if (values.length > 1) return 'partial';
    return 'none';
  };

  return {
    /* Core scores */
    risk_score:   avg('risk_score'),
    trust_score:  avg('trust_score'),
    confidence:   Math.round(avg('confidence') * (count / 3)), // reduced if fewer providers

    /* Recommendation by majority vote */
    recommendation: vote('recommendation'),
    recommendation_agreement: agreementLevel('recommendation'),

    /* Merged verdict text — use the most cautious one */
    admin_notes: results
      .sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))[0]?.admin_notes || '',

    /* Layer results — merged */
    text_analysis: {
      ai_generated_suspected: voteBool('text_analysis.ai_generated_suspected'),
      manipulation_detected:  voteBool('text_analysis.manipulation_detected'),
      issues:           union('text_analysis.issues'),
      positive_signals: union('text_analysis.positive_signals'),
    },
    document_analysis: {
      sufficient:   voteBool('document_analysis.sufficient'),
      count_uploaded: avg('document_analysis.count_uploaded'),
      issues:  union('document_analysis.issues'),
      missing: union('document_analysis.missing'),
    },
    image_analysis: {
      suspicious: voteBool('image_analysis.suspicious'),
      count:      avg('image_analysis.count'),
      issues:     union('image_analysis.issues'),
      notes:      results.find(r => r.image_analysis?.notes)?.image_analysis?.notes || '',
    },
    financial_analysis: {
      reasonable:           voteBool('financial_analysis.reasonable'),
      cost_per_beneficiary: avg('financial_analysis.cost_per_beneficiary'),
      market_comparison:    vote('financial_analysis.market_comparison'),
      issues:               union('financial_analysis.issues'),
    },
    user_risk: {
      level:  vote('user_risk.level'),
      reason: results.find(r => r.user_risk?.reason)?.user_risk?.reason || '',
    },
    ngo_analysis: results.find(r => r.ngo_analysis?.used)?.ngo_analysis || {
      used: false, consistency_with_request: null, trust_level: null, issues: [],
    },

    /* Union all flags */
    flags: union('flags'),

    verification_status: {
      ai_complete:    true,
      ngo_required:   voteBool('verification_status.ngo_required'),
      ngo_completed:  false,
      ready_for_admin: voteBool('verification_status.ready_for_admin'),
    },

    /* Meta — per-provider breakdown for admin transparency */
    _providers: {
      used:     successes.map(s => s.provider),
      failed:   failures.map(f => ({ provider: f.provider, error: f.error })),
      count_used:   count,
      count_failed: failures.length,
      partial_consensus: failures.length > 0,
      individual_scores: successes.map(s => ({
        provider:      s.provider,
        risk_score:    s.data.risk_score,
        trust_score:   s.data.trust_score,
        recommendation:s.data.recommendation,
        flags_count:   s.data.flags?.length || 0,
      })),
    },
  };
};

/* ═══════════════════════════════════════════════════════════════
   SHARED PROMPTS
═══════════════════════════════════════════════════════════════ */
const ANALYSIS_SYSTEM = `You are an expert fraud detection and trust AI for Pathbridge, a Nigerian social impact crowdfunding platform.
You perform multi-layer verification of funding requests submitted by individuals and communities.
Nigerian context is critical — consider local language patterns, regional costs, common social problems, and typical NGN amounts for different project types.
Be thorough, fair, and precise. Always respond in valid JSON only. No preamble, no markdown fences, no explanation outside the JSON.`;

const buildAnalysisPrompt = (request, submitter) => `Perform a full 5-layer verification analysis of this funding request.

━━ REQUEST DATA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title:           ${request.title}
Description:     ${request.description}
Impact statement:${request.impact_statement || 'Not provided'}
Category:        ${request.category}
Fund type:       ${request.fund_type}
SDG number:      ${request.sdg_number}
Amount needed:   ₦${request.amount_needed?.toLocaleString()}
Amount raised:   ₦${(request.amount_raised || 0).toLocaleString()}
Beneficiaries:   ${request.beneficiaries_count}
State:           ${request.state}
LGA:             ${request.lga}
Urgency:         ${request.urgency}
Media uploaded:  ${request.media?.length || 0} file(s) — types: ${request.media?.map(m => m.type).join(', ') || 'none'}
Tags:            ${request.tags?.join(', ') || 'none'}

━━ SUBMITTER CONTEXT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Account age:     ${submitter ? Math.round((Date.now() - new Date(submitter.created_at)) / (1000 * 60 * 60 * 24)) + ' days' : 'unknown'}
Verified user:   ${submitter?.is_verified || false}
Past requests:   ${submitter?.total_requests_submitted || 0}

━━ REQUIRED OUTPUT (strict JSON, no extras) ━━━━━━━━━━━━━━━━
{
  "risk_score": <0-100, higher = more risky>,
  "trust_score": <0-100, higher = more trustworthy>,
  "confidence": <0-100, your confidence in this analysis>,
  "recommendation": <"approve" | "needs_ngo" | "needs_review" | "high_risk">,
  "admin_notes": "<1 concise sentence verdict>",
  "text_analysis": {
    "ai_generated_suspected": <true|false>,
    "manipulation_detected": <true|false>,
    "issues": ["<issue>"],
    "positive_signals": ["<signal>"]
  },
  "document_analysis": {
    "sufficient": <true|false>,
    "count_uploaded": <number>,
    "issues": ["<issue>"],
    "missing": ["<what's missing>"]
  },
  "image_analysis": {
    "suspicious": <true|false>,
    "count": <number>,
    "issues": ["<issue>"],
    "notes": "<brief observation>"
  },
  "financial_analysis": {
    "reasonable": <true|false>,
    "cost_per_beneficiary": <number or null>,
    "market_comparison": <"cheap"|"reasonable"|"expensive"|"very_expensive">,
    "issues": ["<issue>"]
  },
  "user_risk": {
    "level": <"low"|"medium"|"high">,
    "reason": "<1 sentence>"
  },
  "ngo_analysis": {
    "used": false,
    "consistency_with_request": null,
    "trust_level": null,
    "issues": []
  },
  "flags": ["<critical flag>"],
  "verification_status": {
    "ai_complete": true,
    "ngo_required": <true|false>,
    "ngo_completed": false,
    "ready_for_admin": <true|false>
  }
}`;

const CROSS_CHECK_SYSTEM = `You are an independent auditor for Pathbridge, a Nigerian social impact platform.
You cross-check NGO field verification reports against original funding requests to detect fraud, inconsistencies, and padding.
Nigerian context matters. Be fair but rigorous. Always respond in valid JSON only. No preamble.`;

const buildCrossCheckPrompt = (req, rep, ngoName, priorAI) => `Cross-check this NGO field report against the original request.

━━ ORIGINAL REQUEST ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title:          ${req.title}
Description:    ${req.description}
Amount needed:  ₦${req.amount_needed?.toLocaleString()}
Beneficiaries:  ${req.beneficiaries_count}
Location:       ${req.state}, ${req.lga}
Category:       ${req.category}
Prior AI check: trust=${priorAI?.trust_score ?? 'N/A'}, risk=${priorAI?.risk_score ?? 'N/A'}, rec=${priorAI?.recommendation ?? 'N/A'}

━━ NGO FIELD REPORT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NGO:                    ${ngoName}
Site visited:           ${rep.site_visited}
Visit date:             ${rep.visit_date || 'not stated'}
Beneficiaries confirmed:${rep.beneficiaries_confirmed ?? 'not stated'}
Location confirmed:     ${rep.location_confirmed}
Needs confirmed:        ${rep.needs_confirmed}
Fraud risk flagged:     ${rep.fraud_risk}
NGO recommendation:     ${rep.recommendation}
GPS logged:             ${rep.gps_coordinates ? `${rep.gps_coordinates.lat},${rep.gps_coordinates.lng}` : 'none'}
Media evidence files:   ${rep.media?.length || 0}
Summary:    ${rep.summary || 'not provided'}
Findings:   ${rep.findings || 'not provided'}
Challenges: ${rep.challenges || 'not provided'}

━━ REQUIRED OUTPUT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "consistency_score": <0-100>,
  "report_authenticity": <0-100>,
  "flags": ["<inconsistency>"],
  "strengths": ["<supporting evidence>"],
  "beneficiary_variance": <"matches"|"slight_variance"|"major_variance"|"unconfirmed">,
  "location_confidence": <"confirmed"|"partial"|"unconfirmed">,
  "evidence_quality": <"strong"|"moderate"|"weak"|"absent">,
  "risk_assessment": <"low"|"medium"|"high"|"critical">,
  "final_recommendation": <"verify"|"reject"|"escalate"|"more_info">,
  "confidence": <"low"|"medium"|"high">,
  "ai_verdict": "<2-3 sentence verdict for admin>"
}`;

const REVERIFY_SYSTEM = `You are the final verification AI for Pathbridge, a Nigerian social impact platform.
You make the final approval decision by combining all available evidence — AI content analysis, NGO field report, and cross-check scores.
Be decisive but fair. Respond in valid JSON only. No preamble.`;

const buildReverifyPrompt = (request, aiCheck, latestAssignment, crossCheck) => `Make a final approval decision for this funding request.

━━ REQUEST ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title:          ${request.title}
Amount:         ₦${request.amount_needed?.toLocaleString()}
Category:       ${request.category}
Location:       ${request.state}, ${request.lga}
Beneficiaries:  ${request.beneficiaries_count}

━━ LAYER 1 — AI CONTENT ANALYSIS (multi-AI consensus) ━━━━━━
Risk score:          ${aiCheck.risk_score ?? 'not run'}
Trust score:         ${aiCheck.trust_score ?? 'not run'}
AI generated:        ${aiCheck.text_analysis?.ai_generated_suspected ?? 'N/A'}
Financial plausible: ${aiCheck.financial_analysis?.reasonable ?? 'N/A'}
Prior recommendation:${aiCheck.recommendation ?? 'not run'}
Flags:               ${aiCheck.flags?.join('; ') || 'none'}
Providers used:      ${aiCheck._providers?.used?.join(', ') || 'unknown'}

━━ LAYER 2 — NGO FIELD REPORT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NGO:                ${latestAssignment ? `${latestAssignment.ngo?.first_name} ${latestAssignment.ngo?.last_name}` : 'Not assigned'}
Site visited:       ${latestAssignment?.report?.site_visited ?? 'N/A'}
Fraud risk flagged: ${latestAssignment?.report?.fraud_risk ?? 'N/A'}
NGO recommendation: ${latestAssignment?.report?.recommendation ?? 'N/A'}
Evidence files:     ${latestAssignment?.report?.media?.length || 0}

━━ LAYER 3 — AI CROSS-CHECK (multi-AI consensus) ━━━━━━━━━━
Consistency score:   ${crossCheck.consensus?.consistency_score ?? 'not run'}
Report authenticity: ${crossCheck.consensus?.report_authenticity ?? 'not run'}
Risk assessment:     ${crossCheck.consensus?.risk_assessment ?? 'N/A'}
Cross-check verdict: ${crossCheck.consensus?.final_recommendation ?? 'not run'}
Flags:               ${crossCheck.consensus?.flags?.join('; ') || 'none'}

━━ REQUIRED OUTPUT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "final_verdict": <"approve"|"reject"|"escalate">,
  "approval_score": <0-100>,
  "overall_confidence": <"low"|"medium"|"high">,
  "summary": "<3-4 sentence final assessment>",
  "conditions": ["<condition if any>"],
  "red_flags": ["<critical unresolved concern>"],
  "recommended_disbursement_schedule": <"immediate"|"phased"|"hold">
}`;

/* ═══════════════════════════════════════════════════════════════
   CONSENSUS BUILDER FOR CROSS-CHECK
═══════════════════════════════════════════════════════════════ */
const buildCrossCheckConsensus = (successes, failures) => {
  const results = successes.map(s => s.data);
  const count   = results.length;
  const avg     = (f) => Math.round(results.reduce((s, r) => s + (Number(r[f]) || 0), 0) / count);
  const union   = (f) => [...new Set(results.flatMap(r => r[f] || []))];
  const vote    = (f) => {
    const t = {};
    results.forEach(r => { const v = r[f]; if (v) t[v] = (t[v] || 0) + 1; });
    return Object.entries(t).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  };

  return {
    consistency_score:    avg('consistency_score'),
    report_authenticity:  avg('report_authenticity'),
    flags:                union('flags'),
    strengths:            union('strengths'),
    beneficiary_variance: vote('beneficiary_variance'),
    location_confidence:  vote('location_confidence'),
    evidence_quality:     vote('evidence_quality'),
    risk_assessment:      vote('risk_assessment'),
    final_recommendation: vote('final_recommendation'),
    confidence:           vote('confidence'),
    ai_verdict: results
      .sort((a, b) => (b.consistency_score || 0) - (a.consistency_score || 0))[0]?.ai_verdict || '',
    _providers: {
      used:   successes.map(s => s.provider),
      failed: failures.map(f => ({ provider: f.provider, error: f.error })),
      individual_scores: successes.map(s => ({
        provider:            s.provider,
        consistency_score:   s.data.consistency_score,
        report_authenticity: s.data.report_authenticity,
        final_recommendation:s.data.final_recommendation,
      })),
    },
  };
};

/* ═══════════════════════════════════════════════════════════════
   1. GET CACHED ANALYSIS
═══════════════════════════════════════════════════════════════ */
const getAnalysis = async (requestId) => {
  const request = await Request.findById(requestId)
    .select('title verification.ai_check verification.ai_final')
    .lean();
  if (!request) throw ApiError.notFound('Request not found');

  const redis  = getRedisClient();
  const cached = await redis.get(cacheKey(requestId));
  if (cached) {
    const parsed   = JSON.parse(cached);
    const ageMs    = Date.now() - new Date(parsed.analysed_at).getTime();
    const ageHours = Math.round(ageMs / (1000 * 60 * 60));
    return { cached: true, age_hours: ageHours, analysed_at: parsed.analysed_at, analysis: parsed.analysis };
  }

  const stored = request.verification?.ai_check;
  if (stored) return { cached: true, age_hours: null, analysed_at: stored.checked_at, analysis: stored };

  return { cached: false, age_hours: null, analysed_at: null, analysis: null };
};

/* ═══════════════════════════════════════════════════════════════
   2. FULL REQUEST ANALYSIS  (all 3 providers in parallel)
═══════════════════════════════════════════════════════════════ */
const analyseRequest = async (requestId, adminId) => {
  const [request, submitter] = await Promise.all([
    Request.findById(requestId).lean(),
    Request.findById(requestId)
      .select('requester')
      .lean()
      .then(r => r?.requester
        ? User.findById(r.requester).select('created_at total_requests_submitted is_verified').lean()
        : null),
  ]);
  if (!request) throw ApiError.notFound('Request not found');

  const prompt = buildAnalysisPrompt(request, submitter);

  let consensus;
  try {
    /* Call all available AI providers concurrently */
    const { successes, failures } = await callAllProviders(ANALYSIS_SYSTEM, prompt);

    /* Merge into consensus */
    consensus = buildConsensus(successes, failures);
  } catch (err) {
    /* Graceful fallback if all providers fail */
    console.error(`[AI] Analysis failed, using fallback: ${err.message}`);
    consensus = buildFallbackAnalysis(err.message);
  }

  const payload = {
    analysed_at: new Date().toISOString(),
    analysed_by: adminId,
    analysis:    { ...consensus, checked_at: new Date() },
  };

  const redis = getRedisClient();
  await redis.setEx(cacheKey(requestId), CACHE_TTL, JSON.stringify(payload));
  await Request.findByIdAndUpdate(requestId, {
    'verification.ai_check': payload.analysis,
  });

  return {
    cached:      false,
    age_hours:   0,
    analysed_at: payload.analysed_at,
    analysis:    payload.analysis,
  };
};

/* ═══════════════════════════════════════════════════════════════
   3. CROSS-CHECK NGO REPORT  (all 3 providers in parallel)
═══════════════════════════════════════════════════════════════ */
const crossCheckNgoReport = async (assignmentId) => {
  const assignment = await NgoAssignment.findById(assignmentId)
    .populate('request')
    .populate('ngo', 'first_name last_name')
    .lean();

  if (!assignment)                    throw ApiError.notFound('Assignment not found');
  if (!assignment.report?.submitted_at) throw ApiError.badRequest('No report submitted yet');

  const req      = assignment.request;
  const rep      = assignment.report;
  const ngoName  = `${assignment.ngo?.first_name} ${assignment.ngo?.last_name}`;

  /* Pull prior AI check (if any) */
  const redis    = getRedisClient();
  const cachedAI = await redis.get(cacheKey(req._id.toString()));
  const priorAI  = cachedAI ? JSON.parse(cachedAI)?.analysis : req.verification?.ai_check;

  const prompt = buildCrossCheckPrompt(req, rep, ngoName, priorAI);

  let consensus;
  try {
    const { successes, failures } = await callAllProviders(CROSS_CHECK_SYSTEM, prompt);
    consensus = buildCrossCheckConsensus(successes, failures);
  } catch (err) {
    console.error(`[AI] Cross-check failed, using fallback: ${err.message}`);
    consensus = buildFallbackAnalysis(err.message);
  }

  /* Persist */
  await NgoAssignment.findByIdAndUpdate(assignmentId, {
    'report.ai_cross_check': { ...consensus, checked_at: new Date() },
  });
  await redis.setEx(reportKey(assignmentId), CACHE_TTL, JSON.stringify({
    checked_at: new Date().toISOString(),
    consensus,
  }));

  return { consensus, providers_used: consensus._providers };
};

/* ═══════════════════════════════════════════════════════════════
   4. SMART NGO MATCHING  (Claude only — ranking needs coherent output)
═══════════════════════════════════════════════════════════════ */
const smartAssignNgo = async (requestId, assignmentType = 'field_verification') => {
  const request = await Request.findById(requestId).lean();
  if (!request) throw ApiError.notFound('Request not found');

  const permField = assignmentType === 'field_verification'
    ? 'permissions.can_verify_requests'
    : 'permissions.can_execute_projects';

  const allVerified = await NgoVerification.find({
    status: 'approved', [permField]: true,
    operational_states: request.state,
  }).populate('ngo', 'first_name last_name email').lean();

  if (!allVerified.length) {
    return { recommendation: null, runner_up: null, third_choice: null,
      matching_logic: `No verified NGOs currently operate in ${request.state}.`, total_eligible: 0 };
  }

  const ngoIds      = allVerified.map(v => v.ngo?._id).filter(Boolean);
  const activeCounts = await NgoAssignment.aggregate([
    { $match: { ngo: { $in: ngoIds }, status: { $in: ['assigned', 'accepted', 'in_progress'] } } },
    { $group: { _id: '$ngo', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(activeCounts.map(a => [a._id.toString(), a.count]));

  const eligible = allVerified.filter(v => {
    const max = v.permissions.max_concurrent_cases;
    return max === 0 || (countMap[v.ngo?._id?.toString()] || 0) < max;
  });

  if (!eligible.length) {
    return { recommendation: null, runner_up: null, third_choice: null,
      matching_logic: 'All verified NGOs in this state are at capacity.', total_eligible: 0 };
  }

  const ngoList = eligible.map((v, i) => [
    `NGO${i + 1}: id=${v.ngo?._id}`,
    `  name="${v.ngo?.first_name} ${v.ngo?.last_name}"`,
    `  tier=${v.verification_tier}`,
    `  sdg_focus=[${v.sdg_focus?.join(', ')}]`,
    `  states=[${v.operational_states?.join(', ')}]`,
    `  active_cases=${countMap[v.ngo?._id?.toString()] || 0}`,
    `  past_project_count=${v.past_projects?.length || 0}`,
    `  total_past_beneficiaries=${v.past_projects?.reduce((s, p) => s + (p.beneficiaries || 0), 0) || 0}`,
  ].join('\n')).join('\n\n');

  const matchPrompt = `Rank the best NGOs for this assignment.

REQUEST: title="${request.title}", category=${request.category}, sdg=${request.sdg_number}, state=${request.state} ${request.lga}, urgency=${request.urgency}, beneficiaries=${request.beneficiaries_count}, type=${assignmentType}

ELIGIBLE NGOs:
${ngoList}

Return top 3:
{
  "top_pick":     { "ngo_id": "<id>", "score": <0-100>, "reason": "<1-2 sentences>" },
  "runner_up":    { "ngo_id": "<id>", "score": <0-100>, "reason": "<1-2 sentences>" },
  "third_choice": { "ngo_id": "<id>", "score": <0-100>, "reason": "<1-2 sentences>" },
  "matching_logic": "<2-3 sentences>"
}`;

  /* Run matching on all 3 providers, take the top_pick from majority vote */
  const MATCH_SYSTEM = `You are an AI matching engine for Pathbridge. Rank verified NGO partners for assignments based on SDG alignment, geographic presence, capacity, tier, and past track record. Respond in valid JSON only.`;

  let matchResults = [];
  try {
    const results = await callAllProviders(MATCH_SYSTEM, matchPrompt);
    matchResults = results.successes;
  } catch (err) {
    console.error(`[AI] NGO matching failed: ${err.message}`);
    /* Return null to indicate no AI recommendation, admin must choose manually */
    return {
      recommendation:  null,
      runner_up:       null,
      third_choice:    null,
      matching_logic:  `AI matching unavailable: ${err.message}. Manual selection required.`,
      total_eligible:  eligible.length,
      provider_picks:  [],
    };
  }

  /* Use Claude's result as primary; if unavailable use first available */
  const primary = matchResults.find(s => s.provider === 'claude')?.data
    || matchResults[0]?.data;

  const enrich = (pick) => {
    if (!pick?.ngo_id) return null;
    const found = eligible.find(v => v.ngo?._id?.toString() === pick.ngo_id);
    return {
      ...pick,
      ngo_details: found ? {
        _id: found.ngo._id, first_name: found.ngo.first_name, last_name: found.ngo.last_name,
        email: found.ngo.email, tier: found.verification_tier,
        sdg_focus: found.sdg_focus, operational_states: found.operational_states,
        active_cases: countMap[found.ngo?._id?.toString()] || 0,
        past_projects: found.past_projects?.length || 0,
      } : null,
    };
  };

  /* Show per-provider top picks so admin can see if models disagreed */
  const provider_picks = matchResults.map(s => ({
    provider: s.provider,
    top_pick: s.data.top_pick,
  }));

  return {
    recommendation:  enrich(primary?.top_pick),
    runner_up:       enrich(primary?.runner_up),
    third_choice:    enrich(primary?.third_choice),
    matching_logic:  primary?.matching_logic,
    total_eligible:  eligible.length,
    provider_picks,                           // transparency: what each AI recommended
    providers_used:  matchResults.map(s => s.provider),
  };
};

/* ═══════════════════════════════════════════════════════════════
   5. FULL REVERIFICATION  (all 3 providers in parallel)
═══════════════════════════════════════════════════════════════ */
const fullReverification = async (requestId) => {
  const [request, latestAssignment] = await Promise.all([
    Request.findById(requestId).lean(),
    NgoAssignment.findOne({
      request: requestId,
      status:  { $in: ['report_submitted', 'completed'] },
    }).sort('-createdAt').populate('ngo', 'first_name last_name').lean(),
  ]);
  if (!request) throw ApiError.notFound('Request not found');

  const aiCheck    = request.verification?.ai_check       || {};
  const crossCheck = latestAssignment?.report?.ai_cross_check || {};

  const prompt = buildReverifyPrompt(request, aiCheck, latestAssignment, { consensus: crossCheck });

  let consensus;
  try {
    const { successes, failures } = await callAllProviders(REVERIFY_SYSTEM, prompt);
    const results  = successes.map(s => s.data);
    const count    = results.length;
    const avg      = (f) => Math.round(results.reduce((s, r) => s + (Number(r[f]) || 0), 0) / count);
    const vote     = (f) => {
      const t = {};
      results.forEach(r => { const v = r[f]; if (v) t[v] = (t[v] || 0) + 1; });
      return Object.entries(t).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    };
    const union    = (f) => [...new Set(results.flatMap(r => r[f] || []))];

    consensus = {
      final_verdict:     vote('final_verdict'),
      approval_score:    avg('approval_score'),
      overall_confidence:vote('overall_confidence'),
      summary:           results.find(r => r.summary)?.summary || '',
      conditions:        union('conditions'),
      red_flags:         union('red_flags'),
      recommended_disbursement_schedule: vote('recommended_disbursement_schedule'),
      _providers: {
        used:   successes.map(s => s.provider),
        failed: failures.map(f => f.provider),
        individual_verdicts: successes.map(s => ({
          provider:       s.provider,
          final_verdict:  s.data.final_verdict,
          approval_score: s.data.approval_score,
        })),
      },
    };
  }   catch (err) {
    console.error(`[AI] Reverification failed, using fallback: ${err.message}`);
    consensus = buildFallbackAnalysis(err.message);
  }

  await Request.findByIdAndUpdate(requestId, {
    'verification.ai_final': { ...consensus, checked_at: new Date() },
  });

  return consensus;
};

module.exports = {
  getAnalysis,
  analyseRequest,
  crossCheckNgoReport,
  smartAssignNgo,
  fullReverification,
};