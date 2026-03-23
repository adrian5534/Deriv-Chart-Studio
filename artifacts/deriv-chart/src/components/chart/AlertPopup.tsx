import React, { useState, useEffect } from 'react';
import { X, Bell } from 'lucide-react';

interface Alert {
  symbol: string;
  price: number;
  condition: string;
  id?: string;
}

interface AlertPopupProps {
  alert: Alert | null;
  onClose: () => void;
}

export default function AlertPopup({ alert, onClose }: AlertPopupProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (alert) {
      setIsVisible(true);
    }
  }, [alert]);

  const handleClose = () => {
    setIsVisible(false);
    onClose();
  };

  if (!alert || !isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in slide-in-from-bottom-4">
      <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-lg shadow-lg p-4 text-white flex items-start gap-3">
        <Bell className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-bold text-sm">Price Alert Triggered!</h3>
          <p className="text-xs mt-1 opacity-90">
            {alert.symbol} crossed {alert.condition} {alert.price}
          </p>
        </div>
        <button
          onClick={handleClose}
          className="flex-shrink-0 hover:bg-emerald-700/50 p-1 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}