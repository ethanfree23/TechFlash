import React from 'react';
import AdminCreateUserModal from '../../AdminCreateUserModal';

/**
 * Sectioned wrapper around the shared AdminCreateUserModal for the Users command center.
 * Preserves the full create flow used elsewhere in the app.
 */
export default function CreateUserModal(props) {
  return (
    <div className="admin-users-create-wrapper">
      {props.isOpen && (
        <div className="fixed inset-0 z-[55] pointer-events-none">
          <div className="absolute top-4 left-1/2 -translate-x-1/2 max-w-lg w-full px-4 pointer-events-auto hidden sm:block">
            <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur px-4 py-2 shadow-lg text-xs text-slate-600">
              <span className="font-semibold text-slate-800">Create user</span>
              {' · '}Basic info → Account type → Role details → Access → Notifications
            </div>
          </div>
        </div>
      )}
      <AdminCreateUserModal {...props} />
    </div>
  );
}
