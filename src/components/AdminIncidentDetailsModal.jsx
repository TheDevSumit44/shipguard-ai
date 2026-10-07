import { useState, useEffect } from 'react';
import { X, MapPin, Clock, AlertTriangle, Save, Loader, Phone, Mail, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { updateShipment, getShipmentById } from '../services/firestoreService';
import toast from 'react-hot-toast';

const INCIDENT_LABELS = {
  fuel_shortage: 'Fuel Shortage',
  engine_failure: 'Engine Failure',
  landslide: 'Landslide',
  accident: 'Accident',
  terrorist_attack: 'Terrorist Attack',
  natural_disaster: 'Natural Disaster',
  port_closure: 'Port Closure',
  customs_delay: 'Customs Delay',
  weather_emergency: 'Weather Emergency',
  other: 'Other Incident'
};

const SEVERITY_COLORS = {
  low: 'bg-green-50 border-green-200 text-green-700',
  medium: 'bg-amber-50 border-amber-200 text-amber-700',
  high: 'bg-orange-50 border-orange-200 text-orange-700',
  critical: 'bg-red-50 border-red-200 text-red-700'
};

export default function AdminIncidentDetailsModal({ isOpen, onClose, incidentNote, shipmentId }) {
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);

  const [updateFormData, setUpdateFormData] = useState({
    status: '',
    riskLevel: '',
    estimatedDelay: '',
    location: '',
    notes: ''
  });

  const [contactFormData, setContactFormData] = useState({
    contactType: 'email',
    contactDetails: '',
    message: ''
  });

  useEffect(() => {
    if (!isOpen || !shipmentId) return;

    const loadShipment = async () => {
      setLoading(true);
      try {
        const data = await getShipmentById(shipmentId);
        setShipment(data);
        setUpdateFormData({
          status: data.status || '',
          riskLevel: data.riskLevel || '',
          estimatedDelay: data.estimatedDelay || '',
          location: `${data.currentLocation?.lat || ''}, ${data.currentLocation?.lng || ''}`,
          notes: data.adminNotes || ''
        });
      } catch (error) {
        console.error('Failed to load shipment:', error);
        toast.error('Failed to load shipment details');
      } finally {
        setLoading(false);
      }
    };

    loadShipment();
  }, [isOpen, shipmentId]);

  const handleUpdateShipment = async (e) => {
    e.preventDefault();
    setUpdating(true);

    try {
      const updateData = {
        status: updateFormData.status || shipment.status,
        riskLevel: updateFormData.riskLevel || shipment.riskLevel,
        estimatedDelay: updateFormData.estimatedDelay ? parseInt(updateFormData.estimatedDelay) : shipment.estimatedDelay,
        adminNotes: updateFormData.notes,
        lastUpdatedBy: 'admin',
        lastUpdatedAt: new Date().toISOString(),
        incidentResponse: true
      };

      await updateShipment(shipmentId, updateData);
      toast.success('Shipment updated successfully. System will recalculate risk...');
      setShowUpdateForm(false);
    } catch (error) {
      console.error('Failed to update shipment:', error);
      toast.error('Failed to update shipment');
    } finally {
      setUpdating(false);
    }
  };

  const handleContactOfficial = async (e) => {
    e.preventDefault();

    try {
      // In a real app, this would send an email/SMS via a backend service
      console.log('Contact:', contactFormData);
      toast.success(
        `${contactFormData.contactType === 'email' ? 'Email' : 'SMS'} sent to ${contactFormData.contactDetails}`
      );
      setShowContactForm(false);
      setContactFormData({
        contactType: 'email',
        contactDetails: '',
        message: ''
      });
    } catch (error) {
      toast.error('Failed to send contact message');
    }
  };

  if (!incidentNote) return null;

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
            <div className="bg-white rounded-2xl shadow-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    incidentNote.severity === 'critical' ? 'bg-red-100' :
                    incidentNote.severity === 'high' ? 'bg-orange-100' :
                    incidentNote.severity === 'medium' ? 'bg-amber-100' : 'bg-green-100'
                  }`}>
                    <AlertTriangle className={`w-5 h-5 ${
                      incidentNote.severity === 'critical' ? 'text-red-600' :
                      incidentNote.severity === 'high' ? 'text-orange-600' :
                      incidentNote.severity === 'medium' ? 'text-amber-600' : 'text-green-600'
                    }`} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">
                      {INCIDENT_LABELS[incidentNote.incidentType] || incidentNote.incidentType}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">{shipment?.trackingId}</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-3 border-slate-200 border-t-brand-600 rounded-full animate-spin" />
                  </div>
                ) : (
                  <>
                    {/* Incident Details */}
                    <div className={`p-4 rounded-lg border-2 ${SEVERITY_COLORS[incidentNote.severity]}`}>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-semibold opacity-75 mb-1">Severity</p>
                          <p className="text-sm font-bold capitalize">{incidentNote.severity}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold opacity-75 mb-1">Description</p>
                          <p className="text-sm">{incidentNote.text}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          {incidentNote.location && (
                            <div className="flex items-start gap-2">
                              <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs opacity-75">Location</p>
                                <p className="text-sm font-medium">
                                  {incidentNote.location.lat?.toFixed(4)}, {incidentNote.location.lng?.toFixed(4)}
                                </p>
                              </div>
                            </div>
                          )}
                          {incidentNote.estimatedDelay > 0 && (
                            <div className="flex items-start gap-2">
                              <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs opacity-75">Est. Delay</p>
                                <p className="text-sm font-medium">+{incidentNote.estimatedDelay} hours</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Current Shipment Status */}
                    {shipment && (
                      <div className="border border-slate-200 rounded-lg p-4">
                        <h3 className="font-semibold text-slate-800 mb-3">Current Shipment Status</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Status</p>
                            <p className="font-medium capitalize">{shipment.status}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Risk Level</p>
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                              shipment.riskLevel === 'critical' ? 'bg-red-100 text-red-700' :
                              shipment.riskLevel === 'high' ? 'bg-orange-100 text-orange-700' :
                              shipment.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {shipment.riskLevel || 'unknown'}
                            </span>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Risk Score</p>
                            <p className="font-medium">{shipment.riskScore || 'N/A'}/100</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Current Estimated Delay</p>
                            <p className="font-medium">{shipment.estimatedDelay || 0} hours</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Origin → Destination</p>
                            <p className="font-medium text-xs">{shipment.origin} → {shipment.destination}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowUpdateForm(!showUpdateForm)}
                        className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium text-sm transition-colors flex items-center justify-center gap-2"
                      >
                        <Save className="w-4 h-4" />
                        Update Shipment
                      </button>
                      <button
                        onClick={() => setShowContactForm(!showContactForm)}
                        className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium text-sm transition-colors flex items-center justify-center gap-2"
                      >
                        <Send className="w-4 h-4" />
                        Contact Official
                      </button>
                    </div>

                    {/* Update Shipment Form */}
                    {showUpdateForm && shipment && (
                      <motion.form
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        onSubmit={handleUpdateShipment}
                        className="border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-4"
                      >
                        <h4 className="font-semibold text-slate-800">Update Shipment Details</h4>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                            <select
                              value={updateFormData.status}
                              onChange={(e) => setUpdateFormData({...updateFormData, status: e.target.value})}
                              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="">Select status...</option>
                              <option value="pending">Pending</option>
                              <option value="in_transit">In Transit</option>
                              <option value="delayed">Delayed</option>
                              <option value="at_risk">At Risk</option>
                              <option value="delivered">Delivered</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Risk Level</label>
                            <select
                              value={updateFormData.riskLevel}
                              onChange={(e) => setUpdateFormData({...updateFormData, riskLevel: e.target.value})}
                              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="">Select risk level...</option>
                              <option value="low">Low Risk</option>
                              <option value="medium">Medium Risk</option>
                              <option value="high">High Risk</option>
                              <option value="critical">Critical Risk</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Est. Delay (hours)</label>
                            <input
                              type="number"
                              min="0"
                              max="720"
                              value={updateFormData.estimatedDelay}
                              onChange={(e) => setUpdateFormData({...updateFormData, estimatedDelay: e.target.value})}
                              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Current Location</label>
                            <input
                              type="text"
                              value={updateFormData.location}
                              onChange={(e) => setUpdateFormData({...updateFormData, location: e.target.value})}
                              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="lat, lng"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Admin Notes</label>
                          <textarea
                            value={updateFormData.notes}
                            onChange={(e) => setUpdateFormData({...updateFormData, notes: e.target.value})}
                            placeholder="Document what actions were taken, incident response, follow-up actions..."
                            rows={4}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                          />
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={updating}
                            className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
                          >
                            {updating ? (
                              <>
                                <Loader className="w-4 h-4 animate-spin" />
                                Updating...
                              </>
                            ) : (
                              <>
                                <Save className="w-4 h-4" />
                                Save Changes
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowUpdateForm(false)}
                            className="flex-1 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium text-sm transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </motion.form>
                    )}

                    {/* Contact Official Form */}
                    {showContactForm && (
                      <motion.form
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        onSubmit={handleContactOfficial}
                        className="border border-purple-200 bg-purple-50 rounded-lg p-4 space-y-4"
                      >
                        <h4 className="font-semibold text-slate-800">Contact Officials</h4>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Contact Method</label>
                          <div className="flex gap-3">
                            {['email', 'phone', 'sms'].map(type => (
                              <label key={type} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name="contactType"
                                  value={type}
                                  checked={contactFormData.contactType === type}
                                  onChange={(e) => setContactFormData({...contactFormData, contactType: e.target.value})}
                                  className="w-4 h-4"
                                />
                                <span className="text-sm capitalize">{type}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            {contactFormData.contactType === 'email' ? 'Email Address' : 'Phone Number'}
                          </label>
                          <input
                            type={contactFormData.contactType === 'email' ? 'email' : 'tel'}
                            value={contactFormData.contactDetails}
                            onChange={(e) => setContactFormData({...contactFormData, contactDetails: e.target.value})}
                            placeholder={contactFormData.contactType === 'email' ? 'official@company.com' : '+1234567890'}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Message</label>
                          <textarea
                            value={contactFormData.message}
                            onChange={(e) => setContactFormData({...contactFormData, message: e.target.value})}
                            placeholder="Incident details and requested actions..."
                            rows={3}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                          />
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="submit"
                            className="flex-1 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
                          >
                            <Send className="w-4 h-4" />
                            Send Message
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowContactForm(false)}
                            className="flex-1 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium text-sm transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </motion.form>
                    )}
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
