import { useState, useEffect } from 'react';
import { AlertTriangle, X, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { addIncidentNote } from '../services/firestoreService';
import { useAuth } from '../contexts/AuthContext';

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

export default function IncidentReportModal({ isOpen, onClose, shipmentId, trackingId, fromNotification = false }) {
  const { currentUser } = useAuth();
  
  const [formData, setFormData] = useState({
    shipmentId: shipmentId || '',
    viewerName: '',
    viewerEmail: currentUser?.email || '',
    incidentType: '',
    severity: '',
    text: '',
    location: { lat: '', lng: '' },
    estimatedDelay: ''
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Update form email when user changes or modal opens
  useEffect(() => {
    if (isOpen && currentUser?.email) {
      setFormData(prev => ({
        ...prev,
        viewerEmail: currentUser.email
      }));
    }
  }, [isOpen, currentUser?.email]);

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

    if (!formData.shipmentId) {
      newErrors.shipmentId = 'Shipment ID is required';
    }
    if (!formData.viewerName || formData.viewerName.trim().length === 0) {
      newErrors.viewerName = 'Your name is required';
    }
    if (!formData.viewerEmail || formData.viewerEmail.trim().length === 0) {
      newErrors.viewerEmail = 'Email is required (auto-filled from your account)';
    }
    // ═══ ISSUE #21: STRICTER EMAIL VALIDATION ═══
    // Validate email format with proper TLD requirement (min 2 chars)
    if (formData.viewerEmail && !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(formData.viewerEmail)) {
      newErrors.viewerEmail = 'Invalid email format (must have valid domain with TLD)';
    }
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
        viewerName: formData.viewerName.trim(),
        viewerEmail: formData.viewerEmail.trim(),
        location: (formData.location.lat || formData.location.lng) ? formData.location : undefined,
        estimatedDelay: formData.estimatedDelay ? parseInt(formData.estimatedDelay) : undefined
      };

      await addIncidentNote(formData.shipmentId, noteData);

      toast.success('Incident report submitted successfully');
      setFormData({
        shipmentId: shipmentId || '',
        viewerName: '',
        viewerEmail: '',
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
            className="fixed -top-96 -left-96 -right-96 -bottom-96 bg-black/30 z-[100]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-[101] flex items-center justify-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-white rounded-2xl shadow-lg max-w-2xl w-[calc(100%-2rem)] h-[calc(100vh-2rem)] sm:h-auto sm:max-h-[90vh] overflow-y-auto mx-4 my-4"
            >
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
                {/* Shipment ID - only show if not passed as prop */}
                {!shipmentId && (
                  <div>
                    <label htmlFor="shipmentId" className="block text-sm font-semibold text-slate-700 mb-2">
                      Shipment ID <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="shipmentId"
                      name="shipmentId"
                      type="text"
                      value={formData.shipmentId}
                      onChange={handleInputChange}
                      placeholder="Enter shipment ID or tracking number..."
                      className={`w-full px-4 py-2.5 rounded-lg border ${
                        errors.shipmentId ? 'border-red-300' : 'border-slate-200'
                      } bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all`}
                    />
                    {errors.shipmentId && (
                      <p className="mt-1 text-xs text-red-600">{errors.shipmentId}</p>
                    )}
                  </div>
                )}

                {/* Viewer Information */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="viewerName" className="block text-sm font-semibold text-slate-700 mb-2">
                      Your Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="viewerName"
                      name="viewerName"
                      type="text"
                      value={formData.viewerName}
                      onChange={handleInputChange}
                      placeholder="Enter your name..."
                      className={`w-full px-4 py-2.5 rounded-lg border ${
                        errors.viewerName ? 'border-red-300' : 'border-slate-200'
                      } bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all`}
                    />
                    {errors.viewerName && (
                      <p className="mt-1 text-xs text-red-600">{errors.viewerName}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="viewerEmail" className="block text-sm font-semibold text-slate-700 mb-2">
                      Your Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="viewerEmail"
                      name="viewerEmail"
                      type="email"
                      value={formData.viewerEmail}
                      readOnly
                      title="Your email is auto-filled from your account and cannot be changed"
                      className={`w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 placeholder-slate-400 cursor-not-allowed opacity-75`}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      This email is automatically set from your account and cannot be modified.
                    </p>
                  </div>
                </div>

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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
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
                        className={`py-2 sm:py-2.5 px-2 sm:px-3 rounded-lg border-2 font-medium text-xs sm:text-sm transition-all cursor-pointer ${
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
