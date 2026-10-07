import { useState } from 'react';
import { AlertTriangle, X, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { addIncidentNote } from '../services/firestoreService';

const INCIDENT_TYPES = [
  { value: 'fuel_shortage', label: 'Fuel Shortage' },
  { value: 'engine_failure', label: 'Engine Failure' },
  { value: 'landslide', label: 'Landslide' },
  { value: 'accident', label: 'Accident' },
  { value: 'terrorist_attack', label: 'Terrorist Attack' },
  { value: 'natural_disaster', label: 'Natural Disaster' },
  { value: 'port_closure', label: 'Port Closure' },
  { value: 'customs_delay', label: 'Customs Delay' },
  { value: 'weather_emergency', label: 'Weather Emergency' },
  { value: 'other', label: 'Other' },
];

const SEVERITY_LEVELS = [
  { value: 'low', label: 'Low', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'medium', label: 'Medium', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-700 border-red-300' },
];

export default function IncidentReportModal({ isOpen, onClose, shipmentId, trackingId }) {
  const [formData, setFormData] = useState({
    incidentType: '',
    severity: '',
    text: '',
    location: { lat: '', lng: '' },
    estimatedDelay: ''
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleLocationChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      location: { ...prev.location, [name]: value }
    }));
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.incidentType) {
      newErrors.incidentType = 'Incident type is required';
    }
    if (!formData.severity) {
      newErrors.severity = 'Severity level is required';
    }
    if (!formData.text || formData.text.trim().length === 0) {
      newErrors.text = 'Description is required';
    }
    if (formData.text && formData.text.length > 1000) {
      newErrors.text = 'Description cannot exceed 1000 characters';
    }

    if (formData.location.lat && (isNaN(formData.location.lat) || formData.location.lat < -90 || formData.location.lat > 90)) {
      newErrors.lat = 'Latitude must be between -90 and 90';
    }
    if (formData.location.lng && (isNaN(formData.location.lng) || formData.location.lng < -180 || formData.location.lng > 180)) {
      newErrors.lng = 'Longitude must be between -180 and 180';
    }

    if (formData.estimatedDelay && (isNaN(formData.estimatedDelay) || formData.estimatedDelay < 0 || formData.estimatedDelay > 720)) {
      newErrors.estimatedDelay = 'Delay must be between 0 and 720 hours';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the errors above');
      return;
    }

    setLoading(true);

    try {
      const noteData = {
        text: formData.text.trim(),
        incidentType: formData.incidentType,
        severity: formData.severity,
        location: (formData.location.lat || formData.location.lng) ? formData.location : undefined,
        estimatedDelay: formData.estimatedDelay ? parseInt(formData.estimatedDelay) : undefined
      };

      await addIncidentNote(shipmentId, noteData);

      toast.success('Incident report submitted successfully');
      setFormData({
        incidentType: '',
        severity: '',
        text: '',
        location: { lat: '', lng: '' },
        estimatedDelay: ''
      });
      onClose();
    } catch (error) {
      console.error('Failed to submit incident report:', error);
      toast.error(error.message || 'Failed to submit incident report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 z-40"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-white rounded-2xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">Report Incident</h2>
                    <p className="text-xs text-slate-500 mt-0.5">{trackingId}</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {/* Incident Type */}
                <div>
                  <label htmlFor="incidentType" className="block text-sm font-semibold text-slate-700 mb-2">
                    Incident Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="incidentType"
                    name="incidentType"
                    value={formData.incidentType}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-2.5 rounded-lg border ${
                      errors.incidentType ? 'border-red-300' : 'border-slate-200'
                    } bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all`}
                  >
                    <option value="">Select incident type...</option>
                    {INCIDENT_TYPES.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  {errors.incidentType && (
                    <p className="mt-1 text-xs text-red-600">{errors.incidentType}</p>
                  )}
                </div>

                {/* Severity Level */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Severity Level <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-4 gap-3">
                    {SEVERITY_LEVELS.map(level => (
                      <button
                        key={level.value}
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({ ...prev, severity: level.value }));
                          if (errors.severity) {
                            setErrors(prev => ({ ...prev, severity: '' }));
                          }
                        }}
                        className={`py-2.5 px-3 rounded-lg border-2 font-medium text-sm transition-all cursor-pointer ${
                          formData.severity === level.value
                            ? `${level.color} border-current`
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {level.label}
                      </button>
                    ))}
                  </div>
                  {errors.severity && (
                    <p className="mt-1 text-xs text-red-600">{errors.severity}</p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="text" className="block text-sm font-semibold text-slate-700 mb-2">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="text"
                    name="text"
                    value={formData.text}
                    onChange={handleInputChange}
                    placeholder="Describe what happened, current situation, and any relevant details..."
                    rows={4}
                    maxLength={1000}
                    className={`w-full px-4 py-2.5 rounded-lg border ${
                      errors.text ? 'border-red-300' : 'border-slate-200'
                    } bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all resize-none`}
                  />
                  <div className="flex items-center justify-between mt-1">
                    {errors.text && (
                      <p className="text-xs text-red-600">{errors.text}</p>
                    )}
                    <p className="text-xs text-slate-400 ml-auto">
                      {formData.text.length}/1000
                    </p>
                  </div>
                </div>

                {/* Location (Optional) */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Current Location (Optional)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="lat" className="block text-xs text-slate-500 mb-1">
                        Latitude
                      </label>
                      <input
                        id="lat"
                        name="lat"
                        type="number"
                        step="0.0001"
                        min="-90"
                        max="90"
                        value={formData.location.lat}
                        onChange={handleLocationChange}
                        placeholder="-90 to 90"
                        className={`w-full px-4 py-2.5 rounded-lg border ${
                          errors.lat ? 'border-red-300' : 'border-slate-200'
                        } bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all`}
                      />
                      {errors.lat && (
                        <p className="mt-0.5 text-xs text-red-600">{errors.lat}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="lng" className="block text-xs text-slate-500 mb-1">
                        Longitude
                      </label>
                      <input
                        id="lng"
                        name="lng"
                        type="number"
                        step="0.0001"
                        min="-180"
                        max="180"
                        value={formData.location.lng}
                        onChange={handleLocationChange}
                        placeholder="-180 to 180"
                        className={`w-full px-4 py-2.5 rounded-lg border ${
                          errors.lng ? 'border-red-300' : 'border-slate-200'
                        } bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all`}
                      />
                      {errors.lng && (
                        <p className="mt-0.5 text-xs text-red-600">{errors.lng}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Estimated Delay */}
                <div>
                  <label htmlFor="estimatedDelay" className="block text-sm font-semibold text-slate-700 mb-2">
                    Estimated Additional Delay (Hours - Optional)
                  </label>
                  <input
                    id="estimatedDelay"
                    name="estimatedDelay"
                    type="number"
                    min="0"
                    max="720"
                    value={formData.estimatedDelay}
                    onChange={handleInputChange}
                    placeholder="0 to 720 hours"
                    className={`w-full px-4 py-2.5 rounded-lg border ${
                      errors.estimatedDelay ? 'border-red-300' : 'border-slate-200'
                    } bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all`}
                  />
                  {errors.estimatedDelay && (
                    <p className="mt-1 text-xs text-red-600">{errors.estimatedDelay}</p>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:bg-slate-400 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Report'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
