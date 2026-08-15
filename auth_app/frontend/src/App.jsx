import { useCallback, useEffect, useRef, useState } from 'react';
import './styles.css';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

/* ─── Attribute labels ──────────────────────── */
const ATTR_LABELS = {
  relationship_type: 'Relationship',
  parties_involved: 'Parties',
  issue_types: 'Issue Type',
  timeline_duration: 'Timeline',
  living_situation: 'Living Situation',
  financial_dependency: 'Financial',
  children_involved: 'Children',
  prior_complaints: 'Prior Complaints',
  evidence_available: 'Evidence',
  relief_sought: 'Relief Sought',
};

const PILL_CLS = {
  'Victim Case Summary': 'pill-summary',
  'Predicted Legal Outcomes': 'pill-outcomes',
  'Expected Duration of the Case': 'pill-duration',
  'Decision Recommendation': 'pill-recommend',
  'Reason for Recommendation': 'pill-reason',
  'Recommended Next Actions': 'pill-actions',
};
const SECTION_ICONS = {
  'Victim Case Summary': 'SUM',
  'Predicted Legal Outcomes': 'OUT',
  'Expected Duration of the Case': 'DUR',
  'Decision Recommendation': 'REC',
  'Reason for Recommendation': 'WHY',
  'Recommended Next Actions': 'ACT',
};

/* ─── SVG Icon Components ───────────────── */
const IconExternal = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);
const IconDoc = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);
const IconScale = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="3" x2="12" y2="21" />
    <path d="M3 9l9-7 9 7-9-7-9 7" />
    <path d="M6 18h12" />
    <polyline points="3 9 9 15 15 9" />
    <polyline points="9 9 15 15 21 9" />
  </svg>
);
const IconArrow = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);
const IconChevron = ({ open }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/* ─── Hero App Preview Panel (replaces illustration) ─── */
function HeroAppPreview() {
  const [hovered, setHovered] = useState(null);
  const features = [
    {
      id: 'chat',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      ),
      label: 'AI Legal Chat',
      sub: 'Confidential · PWDVA Aligned',
      color: '#b45309',
      bg: '#fef3c7',
    },
    {
      id: 'analysis',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      ),
      label: 'Case Analysis',
      sub: 'Outcome Prediction Engine',
      color: '#2563eb',
      bg: '#eff6ff',
    },
    {
      id: 'library',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
      ),
      label: 'Legal Library',
      sub: '10+ Indian Acts & Statutes',
      color: '#7c3aed',
      bg: '#f5f3ff',
    },
    {
      id: 'docs',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
        </svg>
      ),
      label: 'My Documents',
      sub: 'AI-Generated Case Files',
      color: '#059669',
      bg: '#ecfdf5',
    },
    {
      id: 'helpline',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.56a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
        </svg>
      ),
      label: 'Helplines & SOS',
      sub: 'Women Helpline · 181 · NCW',
      color: '#dc2626',
      bg: '#fef2f2',
    },
    {
      id: 'multilang',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      ),
      label: 'Multilingual',
      sub: 'Hindi · Marathi · Tamil · Telugu',
      color: '#0891b2',
      bg: '#ecfeff',
    },
  ];

  return (
    <div style={{
      width: '100%', maxWidth: 500,
      background: '#fff',
      borderRadius: 20,
      border: '1.5px solid #f3e3c2',
      boxShadow: '0 24px 64px rgba(180,83,9,0.13), 0 4px 16px rgba(0,0,0,0.06)',
      overflow: 'hidden',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* App top bar */}
      <div style={{
        background: 'linear-gradient(135deg, #78350f 0%, #b45309 100%)',
        padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {['#ff5f57','#febc2e','#28c840'].map((c,i) => (
            <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
          ))}
        </div>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#fde68a', letterSpacing: '0.02em' }}>
          AbhayaAI — Legal Companion
        </div>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
      </div>

      {/* Status bar */}
      <div style={{
        background: '#fef9f0', padding: '8px 18px',
        borderBottom: '1px solid #f3e3c2',
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 11, color: '#92400e', fontWeight: 600,
      }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        100% Confidential · No data stored
        <span style={{ marginLeft: 'auto', color: '#b45309', display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="10"/>
          </svg>
          Live
        </span>
      </div>

      {/* Feature grid */}
      <div style={{ padding: '14px 14px 6px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {features.map(f => (
          <div
            key={f.id}
            onMouseEnter={() => setHovered(f.id)}
            onMouseLeave={() => setHovered(null)}
            style={{
              background: hovered === f.id ? f.bg : '#fafaf9',
              border: `1.5px solid ${hovered === f.id ? f.color + '44' : '#f0e8d8'}`,
              borderRadius: 12,
              padding: '12px 13px',
              cursor: 'pointer',
              transition: 'all 0.22s cubic-bezier(0.4,0,0.2,1)',
              transform: hovered === f.id ? 'translateY(-2px)' : 'none',
              boxShadow: hovered === f.id ? `0 8px 20px ${f.color}22` : 'none',
            }}
          >
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: hovered === f.id ? f.color : '#f0e8d8',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: hovered === f.id ? '#fff' : '#b45309',
              marginBottom: 8,
              transition: 'all 0.22s',
              flexShrink: 0,
            }}>
              {f.icon}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: hovered === f.id ? f.color : '#292524', lineHeight: 1.3, marginBottom: 2 }}>
              {f.label}
            </div>
            <div style={{ fontSize: 10, color: '#a8a29e', lineHeight: 1.4 }}>{f.sub}</div>
          </div>
        ))}
      </div>

      {/* Chat preview */}
      <div style={{ padding: '6px 14px 14px' }}>
        <div style={{
          background: '#fef9f0',
          border: '1px solid #f3e3c2',
          borderRadius: 12,
          padding: '11px 14px',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #b45309, #78350f)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 11, fontWeight: 800, flexShrink: 0,
          }}>A</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#78350f', marginBottom: 4 }}>AbhayaAI</div>
            <div style={{ fontSize: 11.5, color: '#57534e', lineHeight: 1.6 }}>
              You may be entitled to a <strong style={{ color: '#b45309' }}>Protection Order</strong> under PWDVA §18 and monetary relief under §20.
            </div>
            <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
              {['PWDVA §18','§20 Relief','Free Legal Aid'].map((t,i) => (
                <span key={i} style={{
                  fontSize: 9.5, fontWeight: 700, padding: '2px 8px',
                  borderRadius: 100, background: ['#fef3c7','#eff6ff','#ecfdf5'][i],
                  color: ['#92400e','#1d4ed8','#065f46'][i],
                  border: `1px solid ${['#fde68a','#bfdbfe','#a7f3d0'][i]}`,
                }}>{ t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Inline collapsible source/reference toggle inside analysis sections */
function SourceToggle({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: open ? 'var(--tag-blue)' : 'rgba(37,99,235,0.06)',
          border: '1px solid rgba(37,99,235,0.18)', borderRadius: 8,
          padding: '5px 12px', cursor: 'pointer',
          fontSize: 11.5, fontWeight: 600, color: '#2563eb',
          transition: 'all 0.15s',
        }}
      >
        <IconChevron open={open} />
        {label}
      </button>
      {open && (
        <div style={{
          marginTop: 8, padding: '10px 14px',
          background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.12)',
          borderRadius: 10, fontSize: 12.5, lineHeight: 1.65, color: 'var(--text-mid)',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* Reference case card for inline display */
function RefCaseCard({ rc }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.05)',
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 6, flexShrink: 0,
        background: '#2563eb', fontSize: 8, fontWeight: 800, color: '#fff',
      }}>REF</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{rc.case_type}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          Duration: {rc.duration_text} &middot; Similarity: {(rc.similarity * 100).toFixed(0)}%
        </div>
        {rc.why_selected && (
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>{rc.why_selected}</div>
        )}
      </div>
    </div>
  );
}

/* Abbreviation badge used as act identifier in lists */
function ActBadge({ abbr, color }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 34, height: 34, borderRadius: 7, flexShrink: 0,
      background: color, fontSize: 9, fontWeight: 800,
      color: '#fff', letterSpacing: '0.03em', textTransform: 'uppercase',
      fontFamily: 'Inter, sans-serif', lineHeight: 1.1, textAlign: 'center',
      padding: '2px 3px', wordBreak: 'break-word',
    }}>{abbr}</span>
  );
}

/* ─── Legal library (rich data + gov links, no emoji) ─── */
const LEGAL_LIBRARY = [
  { id: 'pwdva', abbr: 'PWDVA', color: '#2563eb', title: 'Protection of Women from Domestic Violence Act, 2005', sub: 'PWDVA — Civil Remedy', year: '2005', sections: '37 Sections', tags: [{ l: 'Civil Law', c: 'blue' }, { l: 'Applicable', c: 'green' }], desc: 'Provides protection orders, residence orders, monetary relief and custody orders to victims of domestic violence including physical, verbal, emotional, economic and sexual abuse.', keySections: ['§12 — Application to Magistrate', '§18 — Protection Orders', '§19 — Residence Orders', '§20 — Monetary Relief', '§21 — Custody Orders'], howToUse: 'File application (Form I) under §12 before the Magistrate. A Domestic Violence Protection Officer (DVPO) can assist you file for free. Interim relief is grantable on the same day.', links: [{ label: 'Read Full Act — WCD Ministry', url: 'https://wcd.nic.in/sites/default/files/wcd_domestic-violence.pdf' }, { label: 'NCW — File Complaint Online', url: 'https://ncwapps.nic.in/frmComplaint.aspx' }, { label: 'One Stop Centre Scheme', url: 'https://wcd.nic.in/schemes2014/one-stop-centre-scheme' }] },
  { id: 'ipc498a', abbr: '498A', color: '#dc2626', title: 'IPC §498A / BNS §85 — Cruelty by Husband or Relatives', sub: 'Indian Penal Code / BNS 2023', year: '1860 / 2023', sections: '§498A', tags: [{ l: 'Criminal Law', c: 'red' }, { l: 'Cognizable', c: 'amber' }], desc: 'Criminally punishes husband or relatives for cruelty — physical or mental — including harassment for dowry. Imprisonment up to 3 years and fine.', keySections: ['§498A — Cruelty (IPC)', '§85 — Cruelty (BNS 2023)', 'Cognizable: FIR without warrant', 'Non-bailable: No automatic bail'], howToUse: 'File an FIR at the nearest police station. If police refuses, file a complaint before a Magistrate under §190 CrPC. The crime is non-bailable so accused can be arrested immediately.', links: [{ label: 'Read §498A — IndianKanoon', url: 'https://indiankanoon.org/doc/538436/' }, { label: 'eCourts — Track your Case', url: 'https://services.ecourts.gov.in/' }, { label: 'Bharatiya Nyaya Sanhita, BNS 2023', url: 'https://www.indiacode.nic.in/handle/123456789/20062' }] },
  { id: 'crpc125', abbr: 'CrPC', color: '#059669', title: 'Section 125 CrPC — Maintenance of Wives & Children', sub: 'Code of Criminal Procedure', year: '1973', sections: '§125–128', tags: [{ l: 'Maintenance', c: 'green' }, { l: 'Fast Track', c: 'blue' }], desc: 'Allows wife to claim monthly maintenance from husband if unable to maintain herself. Interim maintenance grantable within 60 days. No court fee required.', keySections: ['§125 — Order for maintenance', '§126 — Jurisdiction of court', '§127 — Alteration in allowance', '§128 — Enforcement by warrant'], howToUse: 'File petition in Family Court or Magistrate court. Attach income proof of husband and your monthly expense details. Interim maintenance is typically granted within 60 days. Free legal aid is available at DLSA.', links: [{ label: 'Read §125 CrPC — IndianKanoon', url: 'https://indiankanoon.org/doc/195908/' }, { label: 'NALSA — Free Legal Aid', url: 'https://nalsa.gov.in/' }, { label: 'eCourts Family Court Locator', url: 'https://districts.ecourts.gov.in/' }] },
  { id: 'dowry', abbr: 'DPA', color: '#7c3aed', title: 'Dowry Prohibition Act, 1961', sub: 'Anti-Dowry Law', year: '1961', sections: '§3,§4,§6', tags: [{ l: 'Criminal Law', c: 'red' }, { l: 'Anti-Dowry', c: 'amber' }], desc: 'Makes giving or taking dowry a criminal offence. Minimum 5 years imprisonment and fine of Rs.15,000 or value of dowry. Covers demand before, at or after marriage.', keySections: ['§3 — Penalty for giving or taking dowry', '§4 — Penalty for demanding dowry', '§6 — Return of dowry to woman', '§8B — Dowry Prohibition Officers'], howToUse: 'Register a complaint with the Dowry Prohibition Officer in your district collector office, or file an FIR at the nearest police station. NCW can also be approached directly.', links: [{ label: 'Read Full Act — IndianKanoon', url: 'https://indiankanoon.org/doc/1007566/' }, { label: 'NCW — Complaint Portal', url: 'https://ncwapps.nic.in/frmComplaint.aspx' }, { label: 'Ministry of Women & Child Dev', url: 'https://wcd.nic.in/' }] },
  { id: 'succession', abbr: 'HSA', color: '#b45309', title: "Hindu Succession Act — Women's Inheritance Rights", sub: 'Property & Inheritance Law', year: '1956 (amended 2005)', sections: '§6,§14', tags: [{ l: 'Property', c: 'amber' }, { l: 'Inheritance', c: 'blue' }], desc: "Grants daughters equal rights to ancestral property as sons (post 2005 amendment). Married daughters retain this right. Applicable to Hindu, Buddhist, Jain, Sikh families.", keySections: ['§6 — Devolution of interest (amended 2005)', '§14 — Property of female Hindu', '§15 — General rules of succession', '§16 — Order of succession'], howToUse: 'File a civil suit in the District Court for partition or declaration of share in ancestral property. Also approach the Tahsildar or Revenue Officer for ancestral property mutation records.', links: [{ label: 'Read Full Act — India Code', url: 'https://www.indiacode.nic.in/handle/123456789/2189' }, { label: 'Department of Justice', url: 'https://doj.gov.in/' }, { label: 'NALSA — Legal Aid & Advice', url: 'https://nalsa.gov.in/' }] },
  { id: 'custody', abbr: 'HMG', color: '#0891b2', title: 'Hindu Minority & Guardianship Act — Child Custody', sub: 'Family & Child Law', year: '1956', sections: '§6,§13', tags: [{ l: 'Child Custody', c: 'green' }, { l: 'Family Law', c: 'blue' }], desc: "Mother is natural guardian of children below 5 years. Courts always prioritize welfare of child. Father's rights are not absolute; child's welfare is the paramount consideration.", keySections: ['§6 — Natural guardians of Hindu minor', '§13 — Welfare of minor is paramount', '§7 — Guardianship in matters of adoption', 'PWDVA §21 — Temporary Custody (emergency)'], howToUse: "File a Guardianship petition in the Family Court. For emergency custody, apply under PWDVA §26. Protection Officers can assist at no cost. Many states waive court fees for women petitioners.", links: [{ label: 'Read HMGA — IndianKanoon', url: 'https://indiankanoon.org/doc/1099021/' }, { label: 'eCourts — Family Court Locator', url: 'https://districts.ecourts.gov.in/' }, { label: 'WCD — Child & Women Welfare', url: 'https://wcd.nic.in/' }] },
  { id: 'it', abbr: 'ITA', color: '#dc2626', title: 'Information Technology Act — Cyber Crimes Against Women', sub: 'IT Act 2000 / BNS 2023', year: '2000', sections: '§66E,§67', tags: [{ l: 'Cyber Crime', c: 'red' }, { l: 'Digital Safety', c: 'blue' }], desc: 'Covers digital stalking, online harassment, morphing, non-consensual sharing of intimate images, cyberstalking, and sextortion. BNS 2023 adds stronger provisions.', keySections: ['§66E — Violation of privacy (images)', '§67 — Publication of obscene material', '§67A — Sexually explicit material', 'BNS §77 — Stalking (digital or physical)', 'BNS §79 — Voyeurism'], howToUse: 'Report online at the National Cyber Crime Reporting Portal (cybercrime.gov.in). Reports can be made anonymously. Also file FIR at the local Cyber Cell or nearest police station.', links: [{ label: 'National Cyber Crime Portal (Govt)', url: 'https://cybercrime.gov.in/' }, { label: 'Read IT Act — India Code', url: 'https://www.indiacode.nic.in/bitstream/123456789/1999/3/A2000-21.pdf' }, { label: 'NCW — Online Complaint', url: 'https://ncwapps.nic.in/frmComplaint.aspx' }] },
  { id: 'posh', abbr: 'POSH', color: '#2563eb', title: 'POSH Act — Prevention of Sexual Harassment at Workplace', sub: 'POSH Act, 2013', year: '2013', sections: '§2,§4,§9', tags: [{ l: 'Workplace', c: 'blue' }, { l: 'Sexual Harassment', c: 'red' }], desc: 'Every organization with 10+ employees must constitute an Internal Complaints Committee (ICC). Covers all forms of sexual harassment at workplace, on work trips, and in online work settings.', keySections: ['§4 — Constitution of Internal Complaints Committee', '§9 — Complaint filing (within 90 days)', '§11 — Inquiry procedure of ICC', '§13 — Recommended action after ICC report'], howToUse: "File complaint with your organization's ICC within 90 days. If no ICC exists, approach the Local Complaints Committee (LCC) at the District level. Register complaint on SHe-Box portal.", links: [{ label: 'SHe-Box — Official Govt Portal', url: 'https://shebox.nic.in/' }, { label: 'Read POSH Act — IndianKanoon', url: 'https://indiankanoon.org/doc/56539849/' }, { label: 'NCW — POSH Complaint', url: 'https://ncwapps.nic.in/frmComplaint.aspx' }] },
  { id: 'crpa', abbr: 'CRPA', color: '#0891b2', title: 'Code of Criminal Procedure — Bail, FIR & Trial Rights', sub: 'CrPC 1973 / BNSS 2023', year: '1973 / 2023', sections: '§154,§437', tags: [{ l: 'Procedure', c: 'blue' }, { l: 'FIR & Bail', c: 'amber' }], desc: 'Governs how FIRs are filed, bail is given or denied, trials are conducted, and how victims can approach courts directly. BNSS 2023 replaced CrPC with updated provisions.', keySections: ['§154 — Information in cognizable offence (FIR)', '§156(3) — Magistrate-ordered investigation', '§437 — Bail in non-bailable offences', '§439 — Special powers of Sessions Court for bail'], howToUse: 'File FIR at nearest police station. If refused, approach Superintendent of Police (SP) or file private complaint before Magistrate under §156(3) or §200 CrPC.', links: [{ label: 'Read CrPC — IndianKanoon', url: 'https://indiankanoon.org/doc/1308537/' }, { label: 'eCourts Case Status Portal', url: 'https://services.ecourts.gov.in/' }, { label: 'BNSS 2023 — India Code', url: 'https://www.indiacode.nic.in/handle/123456789/20062' }] },
  { id: 'ioa', abbr: 'HPS', color: '#059669', title: 'Hindu Marriage Act — Divorce, Alimony & Restitution', sub: 'Hindu Personal & Family Law', year: '1955', sections: '§13,§24,§25', tags: [{ l: 'Divorce', c: 'amber' }, { l: 'Alimony', c: 'green' }], desc: 'Governs Hindu marriage, grounds for divorce, interim alimony during proceedings, permanent alimony after divorce, and restitution of conjugal rights.', keySections: ['§13 — Grounds for divorce', '§13B — Divorce by mutual consent', '§24 — Maintenance pendente lite (during case)', '§25 — Permanent alimony and maintenance'], howToUse: 'File a petition for divorce in the Family Court of the district where you last resided together. You can apply for interim maintenance under §24 immediately after filing.', links: [{ label: 'Read Hindu Marriage Act — IndianKanoon', url: 'https://indiankanoon.org/doc/550624/' }, { label: 'eCourts — Family Court Locator', url: 'https://districts.ecourts.gov.in/' }, { label: 'NALSA — Free Legal Aid', url: 'https://nalsa.gov.in/' }] },
];

/* ─── My Documents (no emoji icons) ───────────── */
const MY_DOCUMENTS = [
  { id: 'intake', abbr: 'AI', color: '#2563eb', title: 'Case Intake Summary', meta: 'AI Generated · Today', tags: [{ l: 'AI Generated', c: 'blue' }, { l: 'Current Case', c: 'green' }], desc: 'AI-generated summary of your case including key facts, timeline, parties involved, and identified legal issues.', content: 'This document is auto-generated after your AbhayaAI consultation. Start a conversation to build your case intake summary with all collected facts.', links: [{ label: 'NCW — Online Legal Consultation', url: 'https://ncwapps.nic.in/frmComplaint.aspx' }, { label: 'NALSA — Free Legal Aid', url: 'https://nalsa.gov.in/' }, { label: 'Legal Services India', url: 'http://www.legalservicesindia.com/' }] },
  { id: 'laws', abbr: 'LAW', color: '#7c3aed', title: 'Applicable Laws Report', meta: 'AI Generated · Today', tags: [{ l: 'Legal Analysis', c: 'blue' }, { l: '10 Acts', c: 'amber' }], desc: 'List of Indian laws, IPC sections and court precedents applicable to your specific situation based on the facts you shared.', content: 'Complete a consultation first. Based on your case, AbhayaAI identifies relevant Indian acts, key sections, and applicable precedents from eCourts judgements.', links: [{ label: 'IndianKanoon — Case Law Search', url: 'https://indiankanoon.org/' }, { label: 'India Code — Official Legislation', url: 'https://www.indiacode.nic.in/' }, { label: 'Department of Justice, India', url: 'https://doj.gov.in/' }] },
  { id: 'protection', abbr: 'FORM', color: '#059669', title: 'Protection Order Application — Form I', meta: 'Template · PWDVA 2005', tags: [{ l: 'Downloadable', c: 'green' }, { l: 'PWDVA', c: 'blue' }], desc: 'Official Form I for applying for a Protection Order before the Magistrate under Protection of Women from Domestic Violence Act 2005.', content: 'Form I is filed under Section 12 of PWDVA 2005 to seek Protection Order, Residence Order, and Monetary Relief. Part A: Your details. Part B: Respondent details. Submit through a Protection Officer or directly at the Magistrate court.', links: [{ label: 'Download Form I — WCD Ministry (PDF)', url: 'https://wcd.nic.in/sites/default/files/wcd_domestic-violence.pdf' }, { label: 'eCourts — Locate Magistrate Court', url: 'https://districts.ecourts.gov.in/' }, { label: 'WCD — Protection Officers Directory', url: 'https://wcd.nic.in/' }] },
  { id: 'checklist', abbr: 'LIST', color: '#b45309', title: 'Evidence Checklist', meta: 'Template · Best Practices', tags: [{ l: 'Checklist', c: 'amber' }, { l: 'Evidence', c: 'red' }], desc: 'Checklist of evidence types to gather — medical reports, messages, photographs, witnesses, financial records.', content: 'Strong evidence significantly improves your case. Collect: (1) Medical injury reports from government hospital (2) Screenshot and backup of abusive messages (3) Photographs of injuries or damaged property (4) Witness names and contact numbers (5) Bank statements showing financial control (6) Audio or video recordings where legal (7) Documents showing husband income and property.', links: [{ label: 'National Cyber Crime Portal — Evidence', url: 'https://cybercrime.gov.in/' }, { label: 'NALSA — Legal Aid Authority', url: 'https://nalsa.gov.in/' }, { label: 'NCW — Women Helpline Support', url: 'https://ncw.nic.in/' }] },
  { id: 'maintenance', abbr: 'CrPC', color: '#0891b2', title: 'Maintenance Claim Guide — Section 125 CrPC', meta: 'Guide · Legal Process', tags: [{ l: 'Step-by-Step', c: 'green' }, { l: 'Maintenance', c: 'blue' }], desc: 'Step-by-step guide to filing a maintenance application in Magistrate court including forms, procedure, and timelines.', content: 'Step 1: File petition in Family Court or Magistrate court using Form II. Step 2: Attach income proof of husband (salary slip, ITR, bank statement). Step 3: Submit your monthly expense statement. Step 4: Court may grant interim maintenance within 60 days of filing. Step 5: Final maintenance order is passed after full hearing. No court fees are required. Free legal aid is available at your District Legal Services Authority (DLSA).', links: [{ label: 'NALSA — Free Legal Aid Authority', url: 'https://nalsa.gov.in/' }, { label: 'District Legal Services Locator', url: 'https://nalsa.gov.in/lsams/' }, { label: 'Read Section 125 CrPC — IndianKanoon', url: 'https://indiankanoon.org/doc/195908/' }] },
  { id: 'helplines', abbr: 'HELP', color: '#dc2626', title: 'Emergency Helplines & Contacts', meta: 'Resource · Always Updated', tags: [{ l: 'Emergency', c: 'red' }, { l: 'Helplines', c: 'amber' }], desc: 'National and state-wise women helplines, legal aid contacts, shelter homes, and specialist police contacts.', content: 'EMERGENCY CONTACTS:\n\nWomen Helpline: 181\nNational Emergency (Police / Fire / Medical): 112\nNCW Helpline: 7827170170\nNational Cyber Crime (Online): 1930\nChild Helpline: 1098\niCall Mental Health (TISS): 9152987821\nVanitha Helpline (South India): 1091\n\nALL calls to 181 are FREE, 24x7, and available in all states.', links: [{ label: 'NCW — National Commission for Women', url: 'https://ncw.nic.in/' }, { label: 'One Stop Centre — WCD Ministry', url: 'https://wcd.nic.in/schemes2014/one-stop-centre-scheme' }, { label: 'NALSA — Legal Aid Locator', url: 'https://nalsa.gov.in/' }] },
];

/* ─── Build action tags from analysis ────────── */
function buildActionTags(fr) {
  if (!fr) return [];
  const tags = [];
  const t = Object.values(fr).join(' ');
  if (/protection order|PWDVA/i.test(t)) tags.push({ label: 'Protection Order Available', cls: 'tag-green' });
  if (/maintenance|alimony|125/i.test(t)) tags.push({ label: 'Maintenance Claim', cls: 'tag-blue' });
  if (/evidence.*weak|no evidence/i.test(t)) tags.push({ label: 'Evidence Gaps Found', cls: 'tag-red' });
  if (/498A|FIR|criminal/i.test(t)) tags.push({ label: 'Criminal FIR Possible', cls: 'tag-amber' });
  if (/urgent|immediate/i.test(t)) tags.push({ label: 'Seek Urgent Help', cls: 'tag-red' });
  if (/residence order/i.test(t)) tags.push({ label: 'Residence Order', cls: 'tag-blue' });
  if (tags.length === 0) tags.push({ label: 'Legal Options Available', cls: 'tag-green' });
  return tags;
}

/* ─── Build accordion source sections ────────── */
function buildAccordionSections(fr) {
  if (!fr) return [];
  const text = Object.values(fr).join(' ');
  const sections = [];

  // Legal issues (amber)
  const issues = [];
  if (/PWDVA|domestic violence/i.test(text)) issues.push({ title: 'PWDVA 2005 — Protection Order', body: 'You may be entitled to a Protection Order, Residence Order, and/or Monetary Relief under the PWDVA 2005. This is a strong civil remedy with fast redressal.', type: 'issue' });
  if (/498A|cruelty/i.test(text)) issues.push({ title: 'IPC §498A — Cruelty', body: 'The conduct described may constitute cruelty under IPC §498A / BNS §85. This is a cognizable and non-bailable offence.', type: 'issue' });
  if (/maintenance/i.test(text)) issues.push({ title: '§125 CrPC — Maintenance Right', body: 'You may claim monthly maintenance under §125 CrPC. No maximum limit — courts decide based on husband\'s income and lifestyle.', type: 'issue' });
  if (issues.length) sections.push({ label: `Legal Issues Found: ${issues.length}`, countCls: 'issues', cards: issues });

  // Evidence gaps (red)
  const gaps = [];
  if (/no evidence|no witness|no medical/i.test(text)) gaps.push({ title: 'Insufficient Evidence', body: 'The case mentions limited evidence. Strengthen your case by collecting WhatsApp messages, photographs, medical reports, and witness statements.', type: 'gap' });
  if (/contested|oppose|reject/i.test(text)) gaps.push({ title: 'Contested Outcome Risk', body: 'The opposite party may contest aggressively. Document all incidents with dates, times, and details. Keep records of all communications.', type: 'gap' });
  if (gaps.length) sections.push({ label: `Evidence Gaps: ${gaps.length}`, countCls: 'gaps', cards: gaps });

  // Legal sources (blue)
  const laws = [];
  if (/PWDVA/i.test(text)) laws.push({ title: 'Protection of Women from Domestic Violence Act, 2005', body: '§12 — Application to Magistrate. §18 — Protection Orders. §19 — Residence Orders. §20 — Monetary Relief. All can be applied simultaneously.', type: 'law' });
  if (/498A|BNS 85/i.test(text)) laws.push({ title: 'IPC §498A / BNS §85', body: 'Cognizable, non-bailable, compoundable only with court permission. FIR can be filed at any police station. Arrest can be made without warrant.', type: 'law' });
  if (/maintenance|Section 125/i.test(text)) laws.push({ title: '§125 CrPC — Maintenance', body: 'Jurisdiction: Magistrate court. Interim maintenance can be ordered within 60 days. Can be enforced by warrant if not paid.', type: 'law' });
  if (laws.length) sections.push({ label: `Legal Sources: ${laws.length}`, countCls: 'sources', cards: laws });

  return sections;
}

/* ─── Build citation cards from analysis ─────── */
function buildCitations(fr) {
  if (!fr) return [];
  const text = Object.values(fr).join(' ');
  const cits = [];
  if (/PWDVA|domestic violence/i.test(text))
    cits.push({ icon: '⚖️', title: 'PWDVA 2005 — Protection Orders', sub: 'Statute · Parliament of India · 2005', col1: { label: 'Type', val: 'Civil Statute' }, col2: { label: 'Remedy', val: 'Protection Order' }, col3: { label: 'Court', val: 'Magistrate' } });
  if (/498A|cruelty/i.test(text))
    cits.push({ icon: '🔴', title: 'IPC §498A — Cruelty', sub: 'Criminal Law · Indian Penal Code · 1860', col1: { label: 'Type', val: 'Criminal' }, col2: { label: 'Penalty', val: '3 yrs + fine' }, col3: { label: 'Bail', val: 'Non-bailable' } });
  if (/maintenance|Section 125/i.test(text))
    cits.push({ icon: '💰', title: '§125 CrPC — Maintenance', sub: 'Procedural Law · CrPC · 1973', col1: { label: 'Type', val: 'Civil Claim' }, col2: { label: 'Court', val: 'Magistrate' }, col3: { label: 'Timeline', val: '1–3 months' } });
  return cits;
}

/* ─── Markdown renderer ───────────────────────── */
function md(text) {
  if (!text) return '';
  let h = text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br />');
  h = h.replace(/(<li>.*?<\/li>(?:\s*<br \/>)*)+/gs, m => `<ul>${m.replace(/<br \/>/g, '')}</ul>`);
  return `<p>${h}</p>`;
}

/* ─── Accordion section (sources panel) ──────── */
function AccSection({ section }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="acc-section">
      <div className="acc-header" onClick={() => setOpen(p => !p)}>
        <div className="acc-header-left">
          <span className={`acc-count ${section.countCls}`}>{section.cards.length}</span>
          <span className="acc-header-title">{section.label}</span>
        </div>
        <span className={`acc-chevron${open ? ' open' : ''}`}>▼</span>
      </div>
      {open && (
        <div className="acc-body">
          {section.cards.map((card, i) => (
            <div key={i} className={`src-highlight-card ${card.type}`}>
              <div className="src-hc-hdr">
                <span className="src-hc-hdr-title">{card.title}</span>
                <button className="src-resolve-btn">Learn more</button>
              </div>
              <div className="src-hc-body">{card.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── My Documents tab ── Two-panel layout ────── */
function MyDocumentsTab({ switchToLibrary, messages, caseSummaryId }) {
  // Build dynamic documents from analysis
  const finalMsg = [...messages].reverse().find(m => m.isFinal && m.finalResponse);
  const fr = finalMsg?.finalResponse || null;
  const dp = finalMsg?.durationPrediction || null;

  function downloadDoc(title, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Generate dynamic docs if analysis exists
  const dynamicDocs = [];
  if (fr) {
    dynamicDocs.push({
      id: 'case-summary', abbr: 'AI', color: '#2563eb',
      title: 'Case Intake Summary',
      meta: `AI Generated · ${new Date().toLocaleDateString()}${caseSummaryId ? ` · ${caseSummaryId}` : ''}`,
      tags: [{ l: 'AI Generated', c: 'blue' }, { l: 'Current Case', c: 'green' }],
      desc: 'Complete AI-generated summary of your case with all collected facts, timeline, and parties.',
      content: fr['Victim Case Summary'] || 'No summary available.',
      downloadable: true,
      fullText: `CASE INTAKE SUMMARY\n${caseSummaryId ? `Case ID: ${caseSummaryId}\n` : ''}Date: ${new Date().toLocaleDateString()}\n\n${fr['Victim Case Summary'] || ''}`,
      links: MY_DOCUMENTS[0].links,
    });
    dynamicDocs.push({
      id: 'legal-outcomes', abbr: 'OUT', color: '#059669',
      title: 'Predicted Legal Outcomes',
      meta: `AI Generated · ${new Date().toLocaleDateString()}`,
      tags: [{ l: 'Prediction', c: 'green' }, { l: 'Court Outcome', c: 'blue' }],
      desc: 'AI-predicted court outcomes including maintenance calculation, protection orders, and criminal prosecution likelihood.',
      content: fr['Predicted Legal Outcomes'] || 'No predictions available.',
      downloadable: true,
      fullText: `PREDICTED LEGAL OUTCOMES\nDate: ${new Date().toLocaleDateString()}\n\n${fr['Predicted Legal Outcomes'] || ''}`,
      links: MY_DOCUMENTS[1].links,
    });
    dynamicDocs.push({
      id: 'duration', abbr: 'TIME', color: '#7c3aed',
      title: 'Case Duration Prediction',
      meta: `AI Generated · ${new Date().toLocaleDateString()}`,
      tags: [{ l: 'Duration', c: 'blue' }, { l: 'Timeline', c: 'amber' }],
      desc: 'Predicted timeline for your case based on similar court cases, complexity, and evidence strength.',
      content: fr['Expected Duration of the Case'] || 'No duration prediction available.',
      downloadable: true,
      fullText: `CASE DURATION PREDICTION\nDate: ${new Date().toLocaleDateString()}\n\n${fr['Expected Duration of the Case'] || ''}`,
      links: [],
    });
    dynamicDocs.push({
      id: 'recommendation', abbr: 'REC', color: '#b45309',
      title: 'Decision Recommendation & Actions',
      meta: `AI Generated · ${new Date().toLocaleDateString()}`,
      tags: [{ l: 'Recommendation', c: 'amber' }, { l: 'Action Plan', c: 'green' }],
      desc: 'Recommended legal strategy and step-by-step actions to take for your situation.',
      content: `${fr['Decision Recommendation'] || ''}\n\nReason: ${fr['Reason for Recommendation'] || ''}\n\nNext Steps:\n${fr['Recommended Next Actions'] || ''}`,
      downloadable: true,
      fullText: `DECISION RECOMMENDATION & ACTIONS\nDate: ${new Date().toLocaleDateString()}\n\nRecommendation: ${fr['Decision Recommendation'] || ''}\nReason: ${fr['Reason for Recommendation'] || ''}\n\nNext Steps:\n${fr['Recommended Next Actions'] || ''}`,
      links: MY_DOCUMENTS[4].links,
    });
    // Full report
    dynamicDocs.push({
      id: 'full-report', abbr: 'FULL', color: '#dc2626',
      title: 'Complete Legal Analysis Report',
      meta: `AI Generated · ${new Date().toLocaleDateString()}`,
      tags: [{ l: 'Complete Report', c: 'red' }, { l: 'Downloadable', c: 'green' }],
      desc: 'Full combined report with all sections — summary, outcomes, duration, recommendation, and actions.',
      content: Object.entries(fr).map(([k, v]) => `**${k}:**\n${v}`).join('\n\n'),
      downloadable: true,
      fullText: `COMPLETE LEGAL ANALYSIS REPORT\n${caseSummaryId ? `Case ID: ${caseSummaryId}\n` : ''}Date: ${new Date().toLocaleDateString()}\n${'='.repeat(50)}\n\n${Object.entries(fr).map(([k, v]) => `${k.toUpperCase()}\n${'-'.repeat(40)}\n${v}`).join('\n\n')}`,
      links: [],
    });
  }

  const allDocs = dynamicDocs.length > 0 ? [...dynamicDocs, ...MY_DOCUMENTS.slice(2)] : MY_DOCUMENTS;
  const [selected, setSelected] = useState(allDocs[0]);
  const [listOpen, setListOpen] = useState(false);

  return (
    <div className="split-pane">
      {/* Left list */}
      <div className={`split-list ${listOpen ? 'open' : ''}`}>
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>My Documents</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fr ? `${dynamicDocs.length} AI reports + templates` : 'Templates, guides & resources'}</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {allDocs.map(doc => (
            <div key={doc.id} onClick={() => { setSelected(doc); setListOpen(false); }} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(0,0,0,0.04)', background: selected?.id === doc.id ? 'var(--bg-white)' : 'transparent', transition: 'background 0.12s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
                <ActBadge abbr={doc.abbr} color={doc.color} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{doc.title}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 43 }}>{doc.meta}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right content */}
      <div className="split-detail">
        <button className="split-menu-btn" onClick={() => setListOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          Documents List
        </button>
        {selected && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <ActBadge abbr={selected.abbr} color={selected.color} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>{selected.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{selected.meta}</div>
              </div>
              {selected.downloadable && (
                <button onClick={() => downloadDoc(selected.title, selected.fullText)} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  color: '#fff', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(37,99,235,0.25)', transition: 'all 0.2s'
                }}>
                  ⬇ Download
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
              {selected.tags.map((t, i) => <span key={i} className={`dtag ${t.c}`}>{t.l}</span>)}
            </div>

            <div style={{ background: 'var(--bg-white)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', marginBottom: 16, boxShadow: 'var(--shadow-xs)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 10 }}>{selected.downloadable ? 'Document Content' : 'About this document'}</div>
              <div style={{ fontSize: 13.5, color: 'var(--text-mid)', lineHeight: 1.65, whiteSpace: 'pre-line' }} dangerouslySetInnerHTML={{ __html: md(selected.content) }} />
            </div>

            {selected.links?.length > 0 && (
              <div style={{ background: 'var(--bg-white)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-xs)' }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>Official Government Links &amp; References</div>
                {selected.links.map((lnk, i) => (
                  <a key={i} href={lnk.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: i < selected.links.length - 1 ? '1px solid var(--border)' : 'none', textDecoration: 'none', transition: 'background 0.12s', color: 'inherit' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--tag-blue)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <div style={{ width: 32, height: 32, borderRadius: 7, background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-muted)' }}><IconDoc /></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{lnk.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{new URL(lnk.url).hostname}</div>
                    </div>
                    <span style={{ color: 'var(--tag-blue-txt)', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600 }}><IconExternal /> Open</span>
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Overlay */}
      {listOpen && <div className="sidebar-overlay" onClick={() => setListOpen(false)} />}
    </div>
  );
}

/* ─── Legal Library tab ── Two-panel layout ────── */
function LegalLibraryTab() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(LEGAL_LIBRARY[0]);
  const [listOpen, setListOpen] = useState(false);
  const filtered = LEGAL_LIBRARY.filter(l =>
    !query || l.title.toLowerCase().includes(query.toLowerCase()) || l.desc.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <div className="split-pane">
      {/* Left list */}
      <div className={`split-list ${listOpen ? 'open' : ''}`}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Legal Library</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-white)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', flexShrink: 0 }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" placeholder="Search acts, sections…" value={query} onChange={e => setQuery(e.target.value)}
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 12.5, fontFamily: 'inherit', color: 'var(--text)' }} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.map(law => (
            <div key={law.id} onClick={() => { setSelected(law); setListOpen(false); }}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(0,0,0,0.04)', background: selected?.id === law.id ? 'var(--bg-white)' : 'transparent', transition: 'background 0.12s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
                <ActBadge abbr={law.abbr} color={law.color} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{law.title.length > 42 ? law.title.slice(0, 42) + '…' : law.title}</span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', paddingLeft: 43 }}>{law.sub} · {law.year}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right detail */}
      <div className="split-detail">
        <button className="split-menu-btn" onClick={() => setListOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          Library Index
        </button>
        {selected && (
          <>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <ActBadge abbr={selected.abbr} color={selected.color} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 3 }}>{selected.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{selected.sub} &nbsp;&middot;&nbsp; {selected.year} &nbsp;&middot;&nbsp; {selected.sections}</div>
            </div>
            <span className="law-badge">Relevant</span>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
            {selected.tags.map((t, i) => <span key={i} className={`dtag ${t.c}`}>{t.l}</span>)}
          </div>

          {/* Description */}
          <div style={{ background: 'var(--bg-white)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 12, boxShadow: 'var(--shadow-xs)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 8 }}>About this Act</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-mid)', lineHeight: 1.7 }}>{selected.desc}</div>
          </div>

          {/* Key Sections */}
          <div style={{ background: 'var(--bg-white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 12, boxShadow: 'var(--shadow-xs)' }}>
            <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', background: 'var(--card-yellow)', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#92400e' }}>Key Sections</div>
            {selected.keySections.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '9px 18px', borderBottom: i < selected.keySections.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, marginTop: 1, flexShrink: 0 }}>&sect;</span>
                <span style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.5 }}>{s}</span>
              </div>
            ))}
          </div>

          {/* How to use */}
          <div style={{ background: 'var(--card-teal)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 12, padding: '14px 18px', marginBottom: 12, boxShadow: 'var(--shadow-xs)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#065f46', marginBottom: 7 }}>How to use this law</div>
            <div style={{ fontSize: 13, color: '#064e3b', lineHeight: 1.65 }}>{selected.howToUse}</div>
          </div>

          {/* Official Gov links */}
          <div style={{ background: 'var(--bg-white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-xs)' }}>
            <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>Official Government References</div>
            {selected.links.map((lnk, i) => (
              <a key={i} href={lnk.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: i < selected.links.length - 1 ? '1px solid var(--border)' : 'none', textDecoration: 'none', transition: 'background 0.12s', color: 'inherit' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--tag-blue)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <div style={{ width: 32, height: 32, borderRadius: 7, background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-muted)' }}><IconDoc /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{lnk.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{new URL(lnk.url).hostname}</div>
                </div>
                <span style={{ fontSize: 13, color: 'var(--tag-blue-txt)', fontWeight: 600 }}>↗ Open</span>
              </a>
            ))}
          </div>
          </>
        )}
      </div>

      {/* Overlay */}
      {listOpen && <div className="sidebar-overlay" onClick={() => setListOpen(false)} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════ */
export default function App() {
  const [sessionId] = useState(() => `s-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState('gathering');
  const [completeness, setCompleteness] = useState(0);
  const [resolvedAttrs, setResolvedAttrs] = useState({});
  const [exchangeCount, setExchangeCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [accSections, setAccSections] = useState([]);
  const [activeTab, setActiveTab] = useState('Conversations');
  const [caseSummaryId, setCaseSummaryId] = useState(null);
  const [lang, setLang] = useState('en');
  const [selectedChips, setSelectedChips] = useState({});
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [guestModalOpen, setGuestModalOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestAge, setGuestAge] = useState('');
  const [guestState, setGuestState] = useState('');
  const [guestCity, setGuestCity] = useState('');
  const [guestError, setGuestError] = useState('');
  const [guestLoading, setGuestLoading] = useState(false);
  const [showLanding, setShowLanding] = useState(true);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(t);
  }, []);

  const LANG_OPTIONS = [
    { code: 'en', label: 'English', flag: 'EN' },
    { code: 'hi', label: 'हिंदी', flag: 'हि' },
    { code: 'mr', label: 'मराठी', flag: 'म' },
    { code: 'ta', label: 'தமிழ்', flag: 'த' },
    { code: 'bn', label: 'বাংলা', flag: 'বা' },
    { code: 'te', label: 'తెలుగు', flag: 'తె' },
  ];

  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }
  }, []);

  // Toggle a chip selection
  // For single-select groups: replaces previous selection
  // For multi-select groups: adds/removes from list
  function toggleChip(groupAttr, chipValue, isMulti) {
    setSelectedChips(prev => {
      const current = prev[groupAttr] || [];
      if (isMulti) {
        // Multi-select: toggle in/out
        if (current.includes(chipValue)) {
          return { ...prev, [groupAttr]: current.filter(v => v !== chipValue) };
        } else {
          return { ...prev, [groupAttr]: [...current, chipValue] };
        }
      } else {
        // Single-select: exclusive — select or deselect
        if (current.includes(chipValue)) {
          return { ...prev, [groupAttr]: [] };
        } else {
          return { ...prev, [groupAttr]: [chipValue] };
        }
      }
    });
  }

  // Send all selected chips as a combined message
  function sendSelectedChips() {
    const parts = [];
    Object.values(selectedChips).forEach(vals => {
      if (vals.length) parts.push(...vals);
    });
    if (parts.length === 0) return;
    const combined = parts.join('. ') + '.';
    setSelectedChips({});
    send(combined);
  }

  // Count total selected chips
  const totalSelected = Object.values(selectedChips).reduce((a, v) => a + v.length, 0);

  async function guestLogin() {
    if (!guestName.trim() || !guestAge || !guestCity.trim()) { setGuestError('Please fill all fields'); return; }
    if (isNaN(guestAge) || guestAge < 10 || guestAge > 120) { setGuestError('Please enter a valid age'); return; }
    setGuestError(''); setGuestLoading(true);
    try {
      const r = await fetch(`${API_BASE}/auth/guest-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: guestName.trim(), age: parseInt(guestAge), city: guestCity.trim() })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Failed to start session');
      sessionStorage.setItem('guest_token', d.access_token);
      setGuestModalOpen(false);
      setShowLanding(false);
    } catch (e) {
      setGuestError(e.message === 'Failed to fetch' ? 'Server unreachable' : e.message);
    } finally { setGuestLoading(false); }
  }

  async function adminLogin() {
    if (!adminEmail.trim() || !adminPass) { setAdminError('Enter email and password'); return; }
    setAdminError(''); setAdminLoading(true);
    try {
      const r = await fetch(`${API_BASE}/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail.trim(), password: adminPass })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Login failed');
      if (d.user?.role !== 'admin') throw new Error('Admin access required');
      sessionStorage.setItem('nd_token', d.access_token);
      sessionStorage.setItem('nd_email', adminEmail.trim());
      setAdminModalOpen(false); setAdminEmail(''); setAdminPass('');
      window.open('/admin-dashboard/', '_blank');
    } catch (e) {
      setAdminError(e.message === 'Failed to fetch' ? 'Server unreachable' : e.message);
    } finally { setAdminLoading(false); }
  }

  async function send(text) {
    if (!text.trim() || loading) return;
    if (activeTab !== 'Conversations') setActiveTab('Conversations');
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: text.trim() }]);
    setInputText('');
    setSelectedChips({});
    setLoading(true);
    setError('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      const res = await fetch(`${API_BASE}/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: text.trim(), language: lang }),
      });
      if (!res.ok) throw new Error(await res.text() || `Error ${res.status}`);
      const data = await res.json();

      setPhase(data.phase || 'gathering');
      setCompleteness((data.completeness || 0) * 100);
      setResolvedAttrs(data.resolved_attributes || {});
      setExchangeCount(data.exchange_count || 0);

      const actionTags = data.is_final ? buildActionTags(data.final_response) : [];
      const citations = data.is_final ? buildCitations(data.final_response) : [];
      const sections = data.is_final ? buildAccordionSections(data.final_response) : [];

      setMessages(prev => [...prev, {
        id: `b-${Date.now()}`,
        role: 'bot',
        content: data.response,
        phase: data.phase || 'gathering',
        isFinal: data.is_final,
        finalResponse: data.final_response,
        durationPrediction: data.duration_prediction || null,
        referenceCases: data.reference_cases || [],
        maintenancePrediction: data.maintenance_prediction || null,
        quickReplies: data.quick_replies || [],
        actionTags,
        citations,
      }]);

      if (data.duration_prediction?.header?.case_summary_id) {
        setCaseSummaryId(data.duration_prediction.header.case_summary_id);
      }

      if (data.is_final && sections.length) {
        setAccSections(sections);
        setSourcesOpen(true);
      }
    } catch (e) {
      setError(e.message || 'Something went wrong.');
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'bot', content: 'I had trouble processing that. Please try again.', actionTags: [], citations: [] }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(inputText); }
  }

  function scrollToSection(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetChat() {
    setMessages([]); setPhase('gathering'); setCompleteness(0);
    setResolvedAttrs({}); setExchangeCount(0); setError('');
    setSourcesOpen(false); setAccSections([]); setCaseSummaryId(null);
    setSelectedChips({});
    setActiveTab('Conversations');
    fetch(`${API_BASE}/chat/reset/${sessionId}`, { method: 'POST' }).catch(() => { });
    setSidebarOpen(true);
  }

  const showWelcome = messages.length === 0;
  const resolvedList = Object.entries(ATTR_LABELS).filter(([k]) => resolvedAttrs[k]).map(([, label]) => label);

  if (showSplash) {
    return (
      <div className="splash-screen">
        <span className="landing-brand-name landing-wordmark splash-wordmark">
          Abhaya<span className="wordmark-accent">AI</span>
        </span>
        <span className="splash-tagline">Confidential legal guidance, one conversation away.</span>
      </div>
    );
  }

  if (showLanding) {
    return (
      <div className="landing-page">

        {/* ── Header ─────────────────────────────── */}
        <header className="landing-header" id="top">
          <div className="landing-header-left">
            <div className="landing-brand-text">
              <span className="landing-brand-name landing-wordmark">Abhaya<span className="wordmark-accent">AI</span></span>
              <span className="landing-brand-sub">A Confidential Companion for Women's Safety</span>
            </div>
          </div>

          <nav className="landing-nav">
            {[
              { label: 'Home', id: 'top' },
              { label: 'About', id: 'about' },
              { label: 'Developer', id: 'developer' },
              { label: 'Legal Library', action: 'modal' },
              { label: 'Contact', id: 'site-footer' },
            ].map((item, i) => (
              <button key={item.label} className={`landing-nav-link${i === 0 ? ' active' : ''}`}
                onClick={() => item.action === 'modal' ? setGuestModalOpen(true) : scrollToSection(item.id)}>
                {item.label}
              </button>
            ))}
          </nav>

          <div className="landing-header-right">
            <button className="landing-admin-btn" onClick={() => setAdminModalOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Admin
            </button>
          </div>
        </header>

        {/* ── Study-purpose notice ──────────────────── */}
        <div className="landing-notice-bar">
          Built for academic and research purposes, on an original, independently curated legal dataset — not a substitute for a licensed lawyer.
        </div>

        {/* ── Hero ────────────────────────────────── */}
        <section className="landing-hero">
          {/* Left: Content */}
          <div className="landing-hero-left">
            <span className="landing-eyebrow-plain">Domestic Violence Act, 2005 · PWDVA</span>

            <h1 className="landing-hero-title">
              Before the Petition.<br />
              Know Your Legal Remedies.<br />
              <span className="accent">Speak with AbhayaAI.</span>
            </h1>

            <p className="landing-hero-sub">
              AbhayaAI is a confidential first step for women who want to understand their legal
              options under the Protection of Women from Domestic Violence Act, 2005 — before any
              petition, lawyer fee, or court visit.
            </p>

            <div className="landing-hero-actions">
              <button id="hero-chat-btn" className="landing-cta-primary" onClick={() => setGuestModalOpen(true)}>
                Start a Conversation
              </button>
              <button id="hero-explore-btn" className="landing-cta-secondary"
                onClick={() => { setGuestModalOpen(true); }}>
                Explore Legal Resources
              </button>
            </div>

            <div className="landing-trust-badges">
              <div className="landing-trust-item">100% Confidential</div>
              <div className="landing-trust-item">Secure &amp; Private</div>
              <div className="landing-trust-item">No Sign-up Required</div>
            </div>
          </div>

          {/* Right: App Preview Panel */}
          <div className="landing-hero-right" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <HeroAppPreview />
          </div>
        </section>

        {/* ── How it works ──────────────────────────── */}
        <section className="landing-how">
          <div className="landing-how-inner">
            <span className="landing-eyebrow-plain">How It Works</span>
            <h2 className="landing-section-title2">Three steps, no waiting rooms</h2>
            <div className="landing-how-steps">
              {[
                { n: '01', title: 'Share your situation', desc: 'Describe what’s happening in your own words — no forms, no account, nothing saved to your name unless you choose to.' },
                { n: '02', title: 'See what the law says', desc: 'We compare your situation against the PWDVA, 2005 and related Indian laws to show what relief may be available to you.' },
                { n: '03', title: 'Walk in prepared', desc: 'Leave with a plain-language case summary and an evidence checklist — before you ever meet a lawyer.' },
              ].map(s => (
                <div key={s.n} className="landing-how-step">
                  <div className="landing-how-num">{s.n}</div>
                  <div>
                    <div className="landing-how-title">{s.title}</div>
                    <div className="landing-how-desc">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Feature Cards Row ────────────────────── */}
        <section className="landing-features-row">
          {[
            { icon: '⚖️', color: 'pink',  title: 'PWDVA 2005', sub: 'Statute-Aligned Guidance', desc: 'Information and remedies aligned with the Protection of Women from Domestic Violence Act, 2005.' },
            { icon: '📋', color: 'rose',  title: 'Sections 18–22', sub: 'Possible Remedies', desc: 'See the specific reliefs that may be available to you under Sections 18 to 22 of the Act.' },
            { icon: '🕐', color: 'blush', title: '24/7', sub: 'Always Available', desc: 'Available anytime, anywhere. Your privacy is protected with end-to-end confidentiality.' },
          ].map((fc, i) => (
            <div key={i} className="landing-feat-card">
              <div className={`landing-feat-icon-wrap ${fc.color}`}>{fc.icon}</div>
              <div className="landing-feat-body">
                <div className="landing-feat-title">{fc.title}</div>
                <div className="landing-feat-sub">{fc.sub}</div>
                <div className="landing-feat-desc">{fc.desc}</div>
              </div>
            </div>
          ))}
        </section>

        {/* ── About ──────────────────────────────── */}
        <section className="landing-about" id="about">
          <div className="landing-about-inner">
            <span className="landing-eyebrow-plain">About</span>
            <h2 className="landing-section-title2">Built to make the first step less overwhelming</h2>
            <p>
              Most women facing domestic violence never get past their first question: <em>"Do I even
              have a case?"</em> AbhayaAI exists to answer that — privately, in plain language, before
              any petition, lawyer fee, or court visit. It reads your situation against the Protection
              of Women from Domestic Violence Act, 2005 and related statutes, and explains what relief
              may be available to you.
            </p>
            <p>
              It is not a lawyer and does not file cases. It is the confidential first conversation
              that helps you walk into a lawyer's office, a police station, or a One Stop Centre
              already knowing your options.
            </p>
          </div>
        </section>

        {/* ── Developer ──────────────────────────── */}
        <section className="landing-developer" id="developer">
          <div className="landing-developer-card">
            <img src="/developer.jpg" alt="Soham Rangdal" className="landing-developer-avatar" />
            <div>
              <span className="landing-eyebrow-plain" style={{ marginBottom: 4 }}>Built &amp; Maintained By</span>
              <h3 className="landing-developer-name">Soham Rangdal</h3>
              <p className="landing-developer-bio">
                Developer of the AbhayaAI platform — designing and building the product end-to-end.
              </p>
              <a className="landing-developer-linkedin" href="https://www.linkedin.com/in/sohamrangdal" target="_blank" rel="noopener noreferrer">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z"/></svg>
                LinkedIn
              </a>
            </div>
          </div>
        </section>

        {/* ── Footer ──────────────────────────────── */}
        <footer className="landing-footer-big" id="site-footer">
          <div className="landing-footer-grid">
            <div className="landing-footer-col landing-footer-brand">
              <div className="landing-footer-brand-row">
                <span className="landing-brand-name landing-wordmark" style={{ color: '#fff' }}>Abhaya<span className="wordmark-accent">AI</span></span>
              </div>
              <p>A confidential companion for women navigating domestic violence law in India.</p>
              <div className="landing-footer-quote-big">❝ Knowledge is Strength. Justice is Your Right. ❞</div>
            </div>

            <div className="landing-footer-col">
              <div className="landing-footer-col-title">Product</div>
              <button onClick={() => setGuestModalOpen(true)}>Chat with AbhayaAI</button>
              <button onClick={() => setGuestModalOpen(true)}>Legal Library</button>
              <button onClick={() => setGuestModalOpen(true)}>My Documents</button>
              <button onClick={() => scrollToSection('top')}>Laws Covered</button>
            </div>

            <div className="landing-footer-col">
              <div className="landing-footer-col-title">Company</div>
              <button onClick={() => scrollToSection('about')}>About</button>
              <button onClick={() => scrollToSection('developer')}>Developer</button>
              <button onClick={() => setAdminModalOpen(true)}>Admin</button>
            </div>

            <div className="landing-footer-col">
              <div className="landing-footer-col-title">Government Resources</div>
              <a href="https://nalsa.gov.in/" target="_blank" rel="noopener noreferrer">NALSA — Free Legal Aid</a>
              <a href="https://ncw.nic.in/" target="_blank" rel="noopener noreferrer">NCW — National Commission for Women</a>
              <a href="https://services.ecourts.gov.in/" target="_blank" rel="noopener noreferrer">eCourts Case Status</a>
              <a href="https://wcd.nic.in/schemes2014/one-stop-centre-scheme" target="_blank" rel="noopener noreferrer">One Stop Centre Scheme</a>
            </div>
          </div>

          <div className="landing-footer-bottom">
            <span>© 2025 AbhayaAI Project. All rights reserved.</span>
            <span>👤 Developed by <strong>Soham Rangdal</strong></span>
          </div>
        </footer>

        {/* ── Admin Login Modal ────────────────────── */}
        {adminModalOpen && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(26,10,16,0.55)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(6px)',
          }} onClick={(e) => { if (e.target === e.currentTarget) setAdminModalOpen(false); }}>
            <div style={{
              background: '#fff', border: '1.5px solid #fde68a', borderRadius: 16, padding: '32px',
              width: 380, maxWidth: '95vw', boxShadow: '0 24px 64px rgba(180,83,9,0.18)',
            }}>
              <div style={{ textAlign: 'center', marginBottom: 22 }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>🔐</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#78350f' }}>Admin Login</div>
                <div style={{ fontSize: 12, color: '#c2ae90', marginTop: 4 }}>Sign in to access the admin dashboard</div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c4a35', marginBottom: 5 }}>Email</label>
                <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)}
                  placeholder="admin@example.com"
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #fde68a', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={e => e.target.style.borderColor = '#b45309'} onBlur={e => e.target.style.borderColor = '#fde68a'}
                  onKeyDown={e => e.key === 'Enter' && document.getElementById('admin-pass-input-l')?.focus()} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c4a35', marginBottom: 5 }}>Password</label>
                <input id="admin-pass-input-l" type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)}
                  placeholder="Enter password"
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #fde68a', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={e => e.target.style.borderColor = '#b45309'} onBlur={e => e.target.style.borderColor = '#fde68a'}
                  onKeyDown={e => e.key === 'Enter' && adminLogin()} />
              </div>
              {adminError && (
                <div style={{ padding: '9px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 13, color: '#b45309', marginBottom: 14 }}>{adminError}</div>
              )}
              <button onClick={adminLogin} disabled={adminLoading}
                style={{ width: '100%', padding: '12px', borderRadius: 10, background: 'linear-gradient(135deg,#b45309,#78350f)', color: '#fff', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(180,83,9,0.28)' }}>
                {adminLoading ? 'Signing in…' : 'Sign in to Dashboard'}
              </button>
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <button onClick={() => setAdminModalOpen(false)}
                  style={{ background: 'none', border: 'none', fontSize: 13, color: '#c2ae90', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Entry Modal — No login required */}
        {guestModalOpen && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(6px)',
          }} onClick={(e) => { if (e.target === e.currentTarget) setGuestModalOpen(false); }}>
            <div style={{
              background: '#fff', border: '1.5px solid #fde68a', borderRadius: 20, padding: '40px 36px 32px',
              width: 420, maxWidth: '95vw', boxShadow: '0 32px 80px rgba(180,83,9,0.18)',
              display: 'flex', flexDirection: 'column', gap: 0,
            }}>
              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px',
                  background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                  border: '2px solid #fbbf24',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div style={{ fontSize: 21, fontWeight: 800, color: '#111', letterSpacing: '-0.02em', marginBottom: 8 }}>
                  Welcome to AbhayaAI
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.65, maxWidth: 300, margin: '0 auto' }}>
                  Your confidential legal companion. <strong style={{ color: '#374151' }}>No account needed.</strong> All conversations are private.
                </div>
              </div>

              {/* Trust badges */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 28, flexWrap: 'wrap' }}>
                {[
                  { icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, label: '100% Private' },
                  { icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, label: 'Available 24/7' },
                  { icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>, label: 'No Sign-up' },
                ].map((b, i) => (
                  <span key={i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 100,
                    background: '#fef9f0', border: '1px solid #fde68a',
                    fontSize: 11.5, fontWeight: 600, color: '#92400e',
                  }}>
                    {b.icon} {b.label}
                  </span>
                ))}
              </div>

              {/* Single CTA — no login */}
              <button
                id="abhaya-begin-btn"
                onClick={() => { setGuestModalOpen(false); setShowLanding(false); }}
                style={{
                  width: '100%', padding: '15px', borderRadius: 12,
                  background: 'linear-gradient(135deg, #b45309, #78350f)',
                  color: '#fff', fontWeight: 700, fontSize: 15,
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 6px 20px rgba(180,83,9,0.32)',
                  transition: 'all 0.22s', letterSpacing: '-0.01em',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, #78350f, #451a03)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 28px rgba(180,83,9,0.38)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, #b45309, #78350f)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(180,83,9,0.32)'; }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                Start Consultation — No Login Required
              </button>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
                <div style={{ flex: 1, height: 1, background: '#f3f4f6' }} />
                <span style={{ fontSize: 12, color: '#9ca3af' }}>or</span>
                <div style={{ flex: 1, height: 1, background: '#f3f4f6' }} />
              </div>

              {/* Admin login link */}
              <button
                onClick={() => { setGuestModalOpen(false); setAdminModalOpen(true); }}
                style={{
                  width: '100%', padding: '11px', borderRadius: 10,
                  background: 'transparent', color: '#78350f',
                  border: '1.5px solid #fde68a', fontWeight: 600, fontSize: 13,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.18s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#fef9f0'; e.currentTarget.style.borderColor = '#b45309'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#fde68a'; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Admin / Staff Login
              </button>

              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button
                  onClick={() => setGuestModalOpen(false)}
                  style={{ background: 'none', border: 'none', fontSize: 12.5, color: '#9ca3af', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Maybe Later
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">

      {/* ── Sidebar Overlay (Mobile) ───────────── */}
      {sidebarOpen && window.innerWidth <= 900 && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ───────────────────────────── */}
      <aside className={`app-sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-top">
          <div className="sidebar-brand" onClick={() => setShowLanding(true)} style={{ cursor: 'pointer' }}>
            <span className="sidebar-brand-name landing-wordmark">Abhaya<span className="wordmark-accent">AI</span></span>
          </div>
          <button className="new-conv-btn" onClick={resetChat}>+ New conversation</button>
        </div>

        <div className="sidebar-search">
          <span className="sidebar-search-icon">🔍</span>
          <input type="text" placeholder="Search conversations…" />
        </div>

        <p className="sidebar-section-label">All conversations</p>

        <div className="sidebar-conversations">
          {/* Active conversation with fact list */}
          <div className="conv-item active" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0 6px' }}>
              <div className="conv-item-body">
                <div className="conv-item-title">{showWelcome ? 'New consultation' : phase === 'gathering' ? 'Intake in progress' : 'Analysis complete'}</div>
                <div className="conv-item-sub">{showWelcome ? 'Active' : `${Math.round(completeness)}% · Active`}</div>
              </div>
              <button className="conv-item-dots">⋯</button>
            </div>
            {/* Sidebar fact items */}
            {resolvedList.length > 0 && (
              <div className="sidebar-fact-list">
                {Object.entries(ATTR_LABELS).filter(([k]) => resolvedAttrs[k]).map(([k, label]) => (
                  <div key={k} className="sidebar-fact-item">
                    <span className="sidebar-fact-icon">✓</span>
                    <div><span className="sidebar-fact-label">{label}</span><span className="sidebar-fact-val">Collected</span></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past conversations */}
          {[
            { title: 'Domestic violence intake', sub: 'Analysis complete · Earlier today' },
            { title: 'Maintenance & alimony query', sub: 'Gathering info · Yesterday' },
            { title: 'Dowry harassment case', sub: 'Complete · 2 days ago' },
          ].map((c, i) => (
            <div key={i} className="conv-item">
              <div className="conv-item-body">
                <div className="conv-item-title">{c.title}</div>
                <div className="conv-item-sub">{c.sub}</div>
              </div>
              <button className="conv-item-dots">⋯</button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">🔒 Confidential &amp; Secure AI</div>
      </aside>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* ── Main ──────────────────────────────── */}
      <main className="app-main">

        {/* ── Top bar (row 1): menu + logo + actions ── */}
        <div className="top-bar no-print">
          <div className="top-bar-left">
            <button className="menu-btn-nav" onClick={() => setSidebarOpen(p => !p)}>☰</button>
            <div className="top-bar-brand">
              <span className="top-bar-name landing-wordmark">Abhaya<span className="wordmark-accent">AI</span></span>
            </div>
          </div>
          <div className="top-bar-right">
            {accSections.length > 0 && activeTab === 'Conversations' && (
              <button
                className={`nav-source-btn${sourcesOpen ? ' open' : ''}`}
                onClick={() => setSourcesOpen(p => !p)}
              >
                📚 {sourcesOpen ? 'Hide' : `Sources (${accSections.reduce((a, s) => a + s.cards.length, 0)})`}
              </button>
            )}
            {messages.length >= 2 && (
              <button className="nav-export-btn no-print" onClick={() => window.print()}>↓ PDF</button>
            )}
            <button
              onClick={() => setAdminModalOpen(true)}
              className="admin-btn-nav"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              Admin
            </button>
            {/* avatar removed */}
          </div>
        </div>

        {/* ── Sub-nav bar (row 2): section tabs ── */}
        <div className="sub-nav-bar no-print">
          {['Conversations', 'My documents', 'Legal library'].map(t => (
            <button
              key={t}
              className={`sub-nav-tab${activeTab === t ? ' active' : ''}`}
              onClick={() => setActiveTab(t)}
            >
              {t === 'Conversations' ? '💬' : t === 'My documents' ? '📄' : '📚'} {t}
            </button>
          ))}
        </div>

        {/* Progress bar */}
        {!showWelcome && phase === 'gathering' && activeTab === 'Conversations' && (
          <div className="progress-bar no-print">
            <div className="progress-fill" style={{ width: `${completeness}%` }} />
          </div>
        )}

        {/* Tab routing */}
        {activeTab === 'My documents' && <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}><MyDocumentsTab switchToLibrary={() => setActiveTab('Legal library')} messages={messages} caseSummaryId={caseSummaryId} /></div>}
        {activeTab === 'Legal library' && <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}><LegalLibraryTab /></div>}

        {/* Conversations tab */}
        {activeTab === 'Conversations' && (
          <div className="chat-viewport">

            {/* Chat body: messages + sources side by side */}
            <div className="chat-body">

              {/* Messages */}
              <div className="messages-area">
                <div className="messages-inner">
                  {error && <div className="error-bar">⚠ {error}</div>}

                  {/* Welcome screen */}
                  {showWelcome && (
                    <div className="welcome-screen">
                      <h2 className="welcome-heading">How AbhayaAI Can Help</h2>
                      <div className="feature-grid">
                        {[
                          { c: 'teal', icon: '💬', title: 'Narrate Your Situation', desc: 'Share what happened, in your own words, confidentially. We turn it into a clear summary of your case.', prompt: 'I need legal help with my situation' },
                          { c: 'yellow', icon: '🧠', title: 'See Possible Legal Remedies', desc: 'We identify the remedies you may be entitled to under Sections 18–22 of the PWDVA, 2005.', prompt: null },
                          { c: 'purple', icon: '📚', title: 'Explore Legal Resources', desc: 'Browse the laws, precedents, and statutory provisions relevant to your situation.', prompt: null },
                          { c: 'blue', icon: '📄', title: 'Build Your Case File', desc: 'Generate organized case summaries, supporting-document checklists, and evidence trackers.', prompt: null },
                        ].map((fc, i) => (
                          <div key={i} className={`feature-card ${fc.c}`} onClick={fc.prompt ? () => send(fc.prompt) : () => setActiveTab(i === 2 ? 'Legal library' : i === 3 ? 'My documents' : 'Conversations')}>
                            <div className="feature-card-icon">{fc.icon}</div>
                            <div className="feature-card-title">{fc.title}</div>
                            <div className="feature-card-desc">{fc.desc}</div>
                          </div>
                        ))}
                      </div>
                      <p className="quick-prompts-label">Common situations</p>
                      <div className="quick-prompts">
                        {[
                          'I am facing domestic violence at home',
                          'My husband is demanding dowry',
                          'I need help with divorce and custody',
                          'I want to file an FIR against harassment',
                          'I need maintenance from my husband',
                        ].map(p => (
                          <button key={p} className="quick-prompt-btn" onClick={() => send(p)}>{p}</button>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Messages */}
                {!showWelcome && (
                  <div className="chat-messages">
                    {messages.map((msg, i) => {
                      if (msg.role === 'user') return (
                        <div key={msg.id} className="msg-row user-row">
                          <div className="msg-body">
                            <div className="bubble user">{msg.content}</div>
                          </div>
                          <div className="msg-avatar user">U</div>
                        </div>
                      );

                      if (msg.isFinal && msg.finalResponse) return (
                        <div key={msg.id} className="msg-row bot-row">
                          <div className="msg-avatar bot"><span className="msg-avatar-mark">A</span></div>
                          <div className="msg-body" style={{ maxWidth: '100%', flex: 1 }}>

                            {/* Inline citation cards (like PDF preview) */}
                            {msg.citations?.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                                {msg.citations.map((cit, ci) => (
                                  <div key={ci} className="citation-card" onClick={() => setSourcesOpen(true)}>
                                    <div className="citation-card-top">
                                      <div className="citation-card-icon">{cit.icon}</div>
                                      <div className="citation-card-meta">
                                        <div className="citation-card-title">{cit.title}</div>
                                        <div className="citation-card-sub">{cit.sub}</div>
                                      </div>
                                    </div>
                                    <div className="citation-card-body">
                                      <div className="citation-card-col"><strong>{cit.col1.label}</strong>{cit.col1.val}</div>
                                      <div className="citation-card-col"><strong>{cit.col2.label}</strong>{cit.col2.val}</div>
                                      <div className="citation-card-col"><strong>{cit.col3.label}</strong>{cit.col3.val}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Analysis card */}
                            <div className="analysis-card">
                              <div className="analysis-card-header">
                                <span style={{ fontSize: 15 }}>⚖️</span>
                                <span className="analysis-card-header-title">AbhayaAI Legal Analysis</span>
                                <span className="analysis-badge">Complete</span>
                              </div>
                              {Object.entries(msg.finalResponse).map(([title, content]) => {
                                const isDuration = title === 'Expected Duration of the Case';
                                const isOutcome = title === 'Predicted Legal Outcomes';
                                const dp = msg.durationPrediction;
                                const refs = msg.referenceCases || [];
                                return (
                                  <div key={title} className="analysis-section">
                                    <span className={`analysis-section-pill ${PILL_CLS[title] || ''}`}>
                                      {SECTION_ICONS[title]} {title}
                                    </span>
                                    <div className="analysis-section-text" dangerouslySetInnerHTML={{ __html: md(content) }} />

                                    {/* Duration section: show prediction ID + reference toggle */}
                                    {isDuration && dp && (
                                      <>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                                          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#059669', background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.2)', borderRadius: 6, padding: '3px 10px' }}>
                                            ID: {dp.header?.case_summary_id}
                                          </span>
                                          <span style={{ fontSize: 10.5, fontWeight: 600, color: '#2563eb', background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.15)', borderRadius: 6, padding: '3px 10px' }}>
                                            Confidence: {dp.predicted_duration?.confidence_level}
                                          </span>
                                          <span style={{ fontSize: 10.5, fontWeight: 600, color: '#b45309', background: 'rgba(180,83,9,0.06)', border: '1px solid rgba(180,83,9,0.15)', borderRadius: 6, padding: '3px 10px' }}>
                                            {dp.predicted_duration?.cases_analyzed} cases analyzed
                                          </span>
                                        </div>
                                        {refs.length > 0 && (
                                          <SourceToggle label={`View ${refs.length} Reference Cases`}>
                                            {refs.map((rc, ri) => <RefCaseCard key={ri} rc={rc} />)}
                                            {dp.reasoning?.key_factors && (
                                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>KEY FACTORS</div>
                                                {dp.reasoning.key_factors.map((f, fi) => (
                                                  <div key={fi} style={{ fontSize: 11.5, color: 'var(--text-mid)', marginBottom: 2 }}>- {f}</div>
                                                ))}
                                              </div>
                                            )}
                                          </SourceToggle>
                                        )}
                                      </>
                                    )}

                                    {/* Outcome section: show source toggle */}
                                    {isOutcome && (
                                      <SourceToggle label="View Legal Sources">
                                        {accSections.filter(s => s.countCls === 'sources').flatMap(s => s.cards).map((card, ci) => (
                                          <div key={ci} style={{ padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{card.title}</div>
                                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{card.body}</div>
                                          </div>
                                        ))}
                                        {accSections.filter(s => s.countCls === 'sources').flatMap(s => s.cards).length === 0 && (
                                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sources are shown in the panel on the right.</div>
                                        )}
                                      </SourceToggle>
                                    )}
                                  </div>
                                );
                              })}

                              {/* Action tags (LegalBot style) */}
                              {msg.actionTags?.length > 0 && (
                                <div className="action-tags-row">
                                  <span className="action-tags-label">Key findings:</span>
                                  {msg.actionTags.map((tag, i) => (
                                    <button key={i} className={`action-tag ${tag.cls}`} onClick={() => setSourcesOpen(true)}>
                                      {tag.icon} {tag.label} <span className="arrow">→</span>
                                    </button>
                                  ))}
                                  {accSections.length > 0 && (
                                    <button className="action-tag tag-blue" onClick={() => setSourcesOpen(true)}>
                                      📚 {accSections.reduce((a, s) => a + s.cards.length, 0)} legal sources <span className="arrow">→</span>
                                    </button>
                                  )}
                                 </div>
                              )}
                            </div>

                            {/* Post-analysis advisory chips */}
                            {msg.quickReplies?.length > 0 && i === messages.length - 1 && !loading && (
                              <div className="quick-chips-wrap" style={{ marginTop: 12 }}>
                                {msg.quickReplies.filter(g => g.attribute === '_advisory').map((group, gi) => (
                                  <div key={gi} className="chip-group advisory-chip-group" style={{ animationDelay: `${gi * 0.1}s` }}>
                                    <div className="chip-group-header">
                                      <span className="chip-group-title">{group.group}</span>
                                      <span className="chip-group-badge" style={{ background: 'rgba(37,99,235,0.08)', color: '#2563eb' }}>Click to explore</span>
                                    </div>
                                    <div className="chip-group-row" style={{ flexWrap: 'wrap' }}>
                                      {group.chips.map((chip, ci) => (
                                        <button
                                          key={ci}
                                          className="chip-option chip-option-advisory"
                                          onClick={() => send(chip.value)}
                                        >
                                          <span className="chip-option-label">{chip.label}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                          </div>
                        </div>
                      );

                      return (
                        <div key={msg.id} className="msg-row bot-row">
                          <div className="msg-avatar bot"><span className="msg-avatar-mark">A</span></div>
                          <div className="msg-body">
                            <div className="bubble bot" dangerouslySetInnerHTML={{ __html: md(msg.content) }} />
                            {/* Grouped multi-select quick-reply chips */}
                            {msg.quickReplies?.length > 0 && i === messages.length - 1 && !loading && (
                              <div className="quick-chips-wrap">
                                {msg.quickReplies.map((group, gi) => {
                                  const isAdvisory = group.attribute === '_advisory';
                                  const isAction = group.attribute === '_action';

                                  // Advisory chips — single-click-to-send, horizontal layout
                                  if (isAdvisory) {
                                    return (
                                      <div key={gi} className="chip-group advisory-chip-group" style={{ animationDelay: `${gi * 0.1}s` }}>
                                        <div className="chip-group-header">
                                          <span className="chip-group-title">{group.group}</span>
                                          <span className="chip-group-badge" style={{ background: 'rgba(37,99,235,0.08)', color: '#2563eb' }}>Click to ask</span>
                                        </div>
                                        <div className="chip-group-row" style={{ flexWrap: 'wrap' }}>
                                          {group.chips.map((chip, ci) => (
                                            <button
                                              key={ci}
                                              className="chip-option chip-option-advisory"
                                              onClick={() => send(chip.value)}
                                            >
                                              <span className="chip-option-label">{chip.label}</span>
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  }

                                  // Regular gathering/action chips
                                  return (
                                    <div key={gi} className="chip-group" style={{ animationDelay: `${gi * 0.1}s` }}>
                                      <div className="chip-group-header">
                                        <span className="chip-group-title">{group.group}</span>
                                        {group.multi && <span className="chip-group-badge">Select multiple</span>}
                                      </div>
                                      <div className="chip-group-row">
                                        {group.chips.map((chip, ci) => {
                                          const isPrimary = chip.label.startsWith('\u2705');
                                          const isSelected = (selectedChips[group.attribute] || []).includes(chip.value);
                                          return (
                                            <button
                                              key={ci}
                                              className={[
                                                'chip-option',
                                                isPrimary ? 'chip-option-primary' : '',
                                                isSelected ? 'chip-option-selected' : '',
                                              ].join(' ')}
                                              onClick={() => {
                                                if (isAction) {
                                                  send(chip.value);
                                                } else {
                                                  toggleChip(group.attribute, chip.value, group.multi);
                                                }
                                              }}
                                            >
                                              {isSelected && <span className="chip-check">✓</span>}
                                              <span className="chip-option-label">{chip.label}</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                                {/* Send selected — only for gathering chips */}
                                {totalSelected > 0 && (
                                  <button className="chip-send-btn" onClick={sendSelectedChips}>
                                    Send {totalSelected} selected answer{totalSelected > 1 ? 's' : ''} →
                                  </button>
                                )}
                                {/* Hint — only for gathering phase */}
                                {msg.phase !== 'advisory' && msg.phase !== 'analysis' && (
                                  <div className="chips-custom-hint">
                                    <span className="chips-hint-icon">✏️</span>
                                    <span>Or type your own answer below</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {loading && (
                      <div className="msg-row bot-row no-print">
                        <div className="msg-avatar bot"><span className="msg-avatar-mark">A</span></div>
                        <div className="msg-body">
                          <div className="typing-bubble"><span /><span /><span /></div>
                        </div>
                      </div>
                    )}

                    {exchangeCount > 0 && phase === 'gathering' && (
                      <div className="collected-wrap no-print">
                        <p className="collected-label">Collected so far:</p>
                        <div className="collected-pills">
                          {Object.entries(ATTR_LABELS).map(([k, label]) =>
                            resolvedAttrs[k]
                              ? <span key={k} className="collected-pill">✓ {label}</span>
                              : null
                          )}
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}
              </div>
            </div>

            {/* Sources panel — accordion style */}
            {sourcesOpen && accSections.length > 0 && (
              <aside className="sources-panel no-print">
                <div className="sources-hdr">
                  <div className="sources-hdr-left">
                    📚 Legal Sources
                    <span className="sources-count-badge">{accSections.reduce((a, s) => a + s.cards.length, 0)}</span>
                  </div>
                  <button className="sources-close" onClick={() => setSourcesOpen(false)}>✕</button>
                </div>
                <div className="sources-list" style={{ padding: 0 }}>
                  {accSections.map((sec, i) => <AccSection key={i} section={sec} />)}
                </div>
              </aside>
            )}
          </div>
        </div>
        )}


        {activeTab === 'Conversations' && (
          <div className="composer-wrap no-print">
            <div className="composer">
              {/* Language selector pill */}
              <div className="lang-selector-wrap">
                <select
                  className="lang-select"
                  value={lang}
                  onChange={e => setLang(e.target.value)}
                  title="Select language"
                >
                  {LANG_OPTIONS.map(l => (
                    <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
                  ))}
                </select>
              </div>
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={e => { setInputText(e.target.value); autoResize(); }}
                onKeyDown={handleKeyDown}
                placeholder={lang === 'hi' ? 'अभयAI से कुछ भी पूछें…' : lang === 'mr' ? 'अभयAI ला काहीही विचारा…' : 'Ask AbhayaAI anything…'}
                disabled={loading}
                rows={1}
              />
              <button className="send-btn" onClick={() => send(inputText)} disabled={loading || !inputText.trim()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Admin Login Modal */}
      {adminModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={(e) => { if (e.target === e.currentTarget) setAdminModalOpen(false); }}>
          <div style={{
            background: 'var(--bg-white, #fff)', border: '1px solid var(--border, #e5e7eb)',
            borderRadius: 12, padding: '32px', width: 360, maxWidth: '95vw',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text, #111)' }}>Admin Login</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginTop: 4 }}>Sign in to access the admin dashboard</div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-mid, #555)', marginBottom: 5 }}>Email</label>
              <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)}
                placeholder="admin@example.com"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                onKeyDown={e => e.key === 'Enter' && document.getElementById('admin-pass-input')?.focus()}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-mid, #555)', marginBottom: 5 }}>Password</label>
              <input id="admin-pass-input" type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)}
                placeholder="Enter password"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                onKeyDown={e => e.key === 'Enter' && adminLogin()}
              />
            </div>
            {adminError && (
              <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{adminError}</div>
            )}
            <button onClick={adminLogin} disabled={adminLoading}
              style={{ width: '100%', padding: '10px', borderRadius: 8, background: '#111', color: '#fff', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              {adminLoading ? 'Signing in...' : 'Sign in to Dashboard'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button onClick={() => setAdminModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-muted, #999)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
