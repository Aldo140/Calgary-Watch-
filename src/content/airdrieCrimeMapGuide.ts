export const AIRDRIE_GUIDE_PATH = '/airdrie-crime-map';
export const AIRDRIE_GUIDE_UPDATED = '2026-08-13';

export const AIRDRIE_GUIDE_SOURCES = [
  {
    name: 'City of Airdrie — official crime map',
    url: 'https://www.airdrie.ca/index.cfm?serviceID=2185',
  },
  {
    name: 'City of Airdrie — report an issue or crime',
    url: 'https://www.airdrie.ca/index.cfm?serviceID=2896',
  },
  {
    name: 'Airdrie RCMP detachment — contact and services',
    url: 'https://www.rcmp-grc.gc.ca/detach/en/d/437?wbdisable=true',
  },
  {
    name: 'City of Airdrie — online crime reporting eligibility',
    url: 'https://www.airdrie.ca/index.cfm?serviceID=2037',
  },
] as const;

export const AIRDRIE_MAP_COMPARISON = [
  {
    need: 'Recent observations shared by community members and selected public sources',
    source: 'Calgary Watch community incident map',
    action: '/map',
    actionLabel: 'Open Calgary Watch',
  },
  {
    need: 'Crime reported to Airdrie RCMP',
    source: 'City of Airdrie official crime map',
    action: AIRDRIE_GUIDE_SOURCES[0].url,
    actionLabel: 'Open the official map',
  },
  {
    need: 'A crime in progress or immediate danger',
    source: 'Emergency services',
    action: 'tel:911',
    actionLabel: 'Call 911',
  },
  {
    need: 'A police matter that is not in progress',
    source: 'Airdrie RCMP non-emergency',
    action: 'tel:4039457267',
    actionLabel: 'Call 403-945-7267',
  },
] as const;

export const AIRDRIE_GUIDE_FAQS = [
  {
    question: 'Is Calgary Watch the official Airdrie crime map?',
    answer:
      'No. Calgary Watch is an independent community-awareness platform. The City of Airdrie publishes a separate official map for crime reported to Airdrie RCMP. Use the source shown on each Calgary Watch marker and open the City map when you need police-reported crime information.',
  },
  {
    question: 'Does this show live police activity in Airdrie?',
    answer:
      'No public Calgary Watch view shows officer locations, dispatch calls, or a complete real-time police activity feed. It shows recent community observations and selected public-source incidents. A marker does not prove that police attended or that a crime was confirmed.',
  },
  {
    question: 'How do I report a crime in Airdrie?',
    answer:
      'Call 911 for an emergency, a crime in progress, or immediate danger. For non-urgent police matters, call Airdrie RCMP at 403-945-7267. The City of Airdrie also links to online RCMP reporting for certain eligible incidents. Posting on Calgary Watch does not create a police report.',
  },
  {
    question: 'Can I view Airdrie reports without an account?',
    answer:
      'Yes. The Calgary Watch map is free to browse without an account. Signing in is required only to submit a community report.',
  },
  {
    question: 'Is Airdrie safe?',
    answer:
      'A single map cannot fairly label an entire city or neighbourhood as safe or dangerous. Look at the type, date, source, and time range of incidents instead of treating marker count as a crime rate. For police-reported patterns, use the City of Airdrie official crime map and RCMP information.',
  },
  {
    question: 'What should I use Airdrie 311 for?',
    answer:
      'Airdrie 311 handles municipal service concerns such as some City property damage and other non-police issues. Dial 311 within Airdrie or 403-948-8800 from outside city limits. Use 911 or Airdrie RCMP when the situation is a police matter.',
  },
] as const;
