// Dynamic Risk Score Calculator based on incident labels
// When admin sets a risk label, calculate the corresponding risk score

export const RISK_THRESHOLDS = {
  low: { min: 0, max: 25 },
  medium: { min: 25, max: 50 },
  high: { min: 50, max: 75 },
  critical: { min: 75, max: 100 }
};

export const RISK_LABEL_TO_SCORE = {
  low: 15,      // Median of 0-25
  medium: 35,   // Median of 25-50
  high: 60,     // Median of 50-75
  critical: 85  // Median of 75-100
};

export const RISK_COLORS = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444'
};

/**
 * Calculate risk score from a risk label
 * @param {string} riskLabel - 'low', 'medium', 'high', or 'critical'
 * @returns {number} Risk score (0-100)
 */
export function calculateRiskScoreFromLabel(riskLabel) {
  const score = RISK_LABEL_TO_SCORE[riskLabel?.toLowerCase()];
  if (typeof score === 'number') {
    return score;
  }
  return 0;
}

/**
 * Calculate estimated delay from risk score
 * @param {number} riskScore - Risk score (0-100)
 * @returns {number} Estimated delay in hours
 */
export function calculateDelayFromRiskScore(riskScore) {
  if (riskScore >= 75) {
    return Math.round(24 + (riskScore - 75) * 1.5);
  }
  if (riskScore >= 50) {
    return Math.round(8 + (riskScore - 50) * 0.64);
  }
  if (riskScore >= 30) {
    return Math.round(2 + (riskScore - 30) * 0.3);
  }
  return 0;
}

/**
 * Get risk level from score
 * @param {number} riskScore - Risk score (0-100)
 * @returns {string} Risk level
 */
export function getRiskLevelFromScore(riskScore) {
  if (riskScore >= 75) return 'critical';
  if (riskScore >= 50) return 'high';
  if (riskScore >= 25) return 'medium';
  return 'low';
}

/**
 * When admin selects a risk label, calculate all related values
 * @param {string} riskLabel - 'low', 'medium', 'high', or 'critical'
 * @returns {object} Object with riskScore, estimatedDelay, riskColor, riskLevel
 */
export function calculateRiskMetricsFromLabel(riskLabel) {
  const riskScore = calculateRiskScoreFromLabel(riskLabel);
  const estimatedDelay = calculateDelayFromRiskScore(riskScore);
  const riskColor = RISK_COLORS[riskLabel?.toLowerCase()] || '#94a3b8';
  
  return {
    riskScore,
    estimatedDelay,
    riskColor,
    riskLevel: riskLabel?.toLowerCase()
  };
}

/**
 * Update shipment data when admin changes risk label
 * Syncs risk score, estimated delay, and color
 * @param {string} riskLabel - The selected risk label
 * @returns {object} Updated shipment data
 */
export function getAdminRiskOverrideData(riskLabel) {
  return {
    ...calculateRiskMetricsFromLabel(riskLabel),
    incidentResponse: true,
    lastUpdatedBy: 'admin',
    lastUpdatedAt: new Date().toISOString()
  };
}
