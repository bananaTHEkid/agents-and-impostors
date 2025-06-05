import React from 'react';
import { GamePhase } from '@/types';

interface NotificationWindowProps {
  notifications: string[];
  currentPhase: GamePhase;
}

const NotificationWindow: React.FC<NotificationWindowProps> = ({ notifications, currentPhase }) => {
  return (
    <div className="notification-window p-4 border rounded-lg shadow-lg bg-white flex flex-col min-h-[200px] max-h-[300px]">
      <h3 className="text-lg font-bold mb-1 text-gray-800 border-b pb-2">Notifications</h3>
      <p className="mb-2 text-sm text-indigo-600 font-semibold">
        Current Phase: <span className="text-purple-700">{currentPhase.replace(/_/g, ' ').toUpperCase()}</span>
      </p>
      <div className="notifications-list flex-grow overflow-y-auto space-y-2 pr-2">
        {notifications.length === 0 && (
          <p className="text-gray-500 italic text-center mt-4">No new notifications.</p>
        )}
        {notifications.map((notification, index) => (
          <div
            key={index}
            className="p-2.5 mb-2 bg-blue-50 border border-blue-200 rounded-md shadow-sm text-sm text-blue-800 break-words"
          >
            {notification}
          </div>
        ))}
      </div>
    </div>
  );
};

export default NotificationWindow;
