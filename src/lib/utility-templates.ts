// =============================================================================
// InteriorOS Backend — Utility / MEP commissioning templates
//
// Nothing here is forced onto a project. Systems are only created when the
// project's own scope mentions them (BOQ / quotation items, site survey MEP
// notes, room requirements), and the team can add, rename, mark N/A or remove
// any system or checkpoint afterwards. These templates only supply a sensible
// starting checklist for a system once it is detected or added by name.
// =============================================================================

export interface UtilityTemplate {
  key: string;
  label: string;
  /** Lower-case words/phrases that indicate this system is in scope. */
  keywords: string[];
  checkpoints: string[];
}

export const UTILITY_TEMPLATES: UtilityTemplate[] = [
  {
    key: 'electrical',
    label: 'Electrical',
    keywords: ['electric', 'wiring', 'socket', 'switch', 'db ', 'distribution board', 'power point', 'cabling', 'conduit', 'mcb', 'electrical points'],
    checkpoints: ['Conduit & wiring layout check', 'Insulation resistance test', 'Earthing / continuity test', 'DB labelling & load balancing', 'Energisation & sign-off'],
  },
  {
    key: 'lighting',
    label: 'Lighting',
    keywords: ['lighting', 'light fixture', 'downlight', 'spotlight', 'led profile', 'chandelier', 'pendant light', 'cove light', 'luminaire'],
    checkpoints: ['Fixture positions vs RCP', 'Circuit & switching test', 'Dimming / scene check', 'Lux level check'],
  },
  {
    key: 'hvac',
    label: 'HVAC',
    keywords: ['hvac', 'ac ', 'a/c', 'air condition', 'split ac', 'fcu', 'ahu', 'duct', 'diffuser', 'grille', 'ventilation', 'exhaust fan', 'chiller', 'vrf', 'ac locations'],
    checkpoints: ['Duct / pipe routing check', 'Refrigerant pressure test', 'Drain line test', 'Airflow balancing', 'Temperature performance & sign-off'],
  },
  {
    key: 'plumbing',
    label: 'Plumbing & Drainage',
    keywords: ['plumb', 'sanitary', 'water supply', 'drain', 'wc', 'wash basin', 'washbasin', 'sink', 'mixer', 'shower', 'pantry', 'kitchen', 'toilet', 'bathroom', 'water heater', 'phe'],
    checkpoints: ['Pipe routing check', 'Hydro / pressure test', 'Drainage flow & leak test', 'Fixture installation check', 'Sign-off'],
  },
  {
    key: 'fire',
    label: 'Fire Fighting & Alarm',
    keywords: ['fire', 'sprinkler', 'smoke detector', 'heat detector', 'fire alarm', 'extinguisher', 'fire rated', 'civil defence', 'civil defense'],
    checkpoints: ['Device layout vs approved drawing', 'Sprinkler pressure test', 'Alarm cause & effect test', 'Civil defence inspection'],
  },
  {
    key: 'elv',
    label: 'ELV / Low Current',
    keywords: ['elv', 'data point', 'network', 'cat6', 'cctv', 'access control', 'intercom', 'tv point', 'speaker', 'audio', 'wifi', 'telephone', 'bms'],
    checkpoints: ['Cable routing & labelling', 'Termination & continuity test', 'Device commissioning', 'Handover documentation'],
  },
  {
    key: 'gas',
    label: 'Gas',
    keywords: ['gas line', 'gas pipe', 'lpg', 'gas supply', 'gas leak'],
    checkpoints: ['Pipe routing check', 'Pressure / leak test', 'Appliance connection & sign-off'],
  },
  {
    key: 'stp',
    label: 'STP / Sewage',
    keywords: ['stp', 'sewage treatment', 'sewage', 'septic'],
    checkpoints: ['Installation check', 'Flow & treatment test', 'Sign-off'],
  },
];

export const slugify = (s: string) =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9؀-ۿ]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'system';

/** Find the template matching a typed system name (e.g. "HVAC", "Plumbing works"). */
export function templateForLabel(label: string): UtilityTemplate | undefined {
  const l = ` ${String(label || '').toLowerCase()} `;
  return UTILITY_TEMPLATES.find(
    (t) => l.includes(t.label.toLowerCase()) || l.includes(` ${t.key} `) || t.keywords.some((k) => l.includes(k))
  );
}

/** Systems the given scope text mentions, in template order. */
export function detectSystems(scopeText: string): UtilityTemplate[] {
  const text = ` ${String(scopeText || '').toLowerCase().replace(/\s+/g, ' ')} `;
  return UTILITY_TEMPLATES.filter((t) => t.keywords.some((k) => text.includes(k)));
}
