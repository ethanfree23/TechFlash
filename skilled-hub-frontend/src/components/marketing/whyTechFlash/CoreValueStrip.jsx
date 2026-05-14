import React from 'react';
import { FaClipboardList, FaLayerGroup, FaListOl, FaWrench } from 'react-icons/fa';

const items = [
  {
    icon: FaWrench,
    title: 'Built for Skilled Trades',
    sub: 'Designed around real field work, not generic hiring.',
  },
  {
    icon: FaLayerGroup,
    title: 'Short-Term by Design',
    sub: 'Perfect for urgent gaps, extra help, and temporary coverage.',
  },
  {
    icon: FaClipboardList,
    title: 'Clear Job Details',
    sub: 'Pay, location, timing, and scope are clear before anyone commits.',
  },
  {
    icon: FaListOl,
    title: 'Simple from Start to Finish',
    sub: 'Post, claim, manage, complete, and pay in one connected workflow.',
  },
];

export function CoreValueStrip() {
  return (
    <section className="border-b border-gray-200 bg-white px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl min-w-0 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, sub }) => (
          <div key={title} className="flex gap-3 rounded-2xl border border-gray-100 bg-gray-50/60 p-5 shadow-sm">
            <Icon className="mt-0.5 h-7 w-7 shrink-0 text-tf-orange" aria-hidden />
            <div>
              <p className="font-bold text-tf-navy">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">{sub}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
