import React from 'react';

export const employeeDisplayName = (user) => {
  if (!user) return '';
  const name = [user.first_name, user.last_name]
    .map((x) => (x || '').trim())
    .filter(Boolean)
    .join(' ');
  return name || user.email || `User #${user.id}`;
};

/**
 * After a company account is chosen, pick who the job is associated with (primary)
 * and who else should be looped in on updates (additional).
 */
const JobCompanyContactsPicker = ({
  employees,
  loading,
  primaryContactUserId,
  additionalContactUserIds,
  onPrimaryChange,
  onAdditionalChange,
}) => {
  const additionalSet = new Set((additionalContactUserIds || []).map((id) => Number(id)));

  if (loading) {
    return <p className="text-xs text-slate-500">Loading employees...</p>;
  }

  if (!employees.length) {
    return (
      <p className="text-xs text-slate-500">
        No company logins found for this account yet.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div>
        <h4 className="text-sm font-semibold text-slate-900">Primary contact</h4>
        <p className="text-xs text-slate-500 mb-2">
          Who this job post is associated with. They get job updates first.
        </p>
        <div className="space-y-1.5">
          {employees.map((user) => {
            const selected = Number(primaryContactUserId) === Number(user.id);
            return (
              <label
                key={`primary-${user.id}`}
                className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer ${
                  selected ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="job-primary-contact"
                  className="mt-1"
                  checked={selected}
                  onChange={() => onPrimaryChange(user.id)}
                />
                <span>
                  <span className="font-medium text-slate-900">{employeeDisplayName(user)}</span>
                  {user.email ? (
                    <span className="block text-xs text-slate-500">{user.email}</span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {employees.length > 1 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Also loop in</h4>
          <p className="text-xs text-slate-500 mb-2">
            Additional people on this company account who should get the same job updates.
          </p>
          <div className="space-y-1.5">
            {employees.map((user) => {
              const isPrimary = Number(primaryContactUserId) === Number(user.id);
              const checked = additionalSet.has(Number(user.id));
              return (
                <label
                  key={`additional-${user.id}`}
                  className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                    isPrimary
                      ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
                      : checked
                        ? 'border-blue-300 bg-blue-50 cursor-pointer'
                        : 'border-slate-200 hover:bg-slate-50 cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={isPrimary}
                    checked={isPrimary ? false : checked}
                    onChange={() => {
                      if (isPrimary) return;
                      const next = checked
                        ? (additionalContactUserIds || []).filter((id) => Number(id) !== Number(user.id))
                        : [...(additionalContactUserIds || []), user.id];
                      onAdditionalChange(next.map((id) => Number(id)));
                    }}
                  />
                  <span>
                    <span className="font-medium text-slate-900">{employeeDisplayName(user)}</span>
                    {user.email ? (
                      <span className="block text-xs text-slate-500">{user.email}</span>
                    ) : null}
                    {isPrimary ? (
                      <span className="block text-xs text-slate-400">Already primary</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default JobCompanyContactsPicker;
