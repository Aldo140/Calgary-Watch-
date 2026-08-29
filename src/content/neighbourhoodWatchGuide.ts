export const GUIDE_PATH = '/calgary-neighbourhood-watch';
export const GUIDE_UPDATED = '2026-08-29';

export const GUIDE_SOURCES = [
  {
    name: 'City of Calgary — police non-emergency contacts',
    url: 'https://www.calgary.ca/safety-contacts/non-emergency.html',
  },
  {
    name: 'Calgary Police Service mobile app and crime-map information',
    url: 'https://www.calgary.ca/cps/public-services/calgary-police-mobile-app.html',
  },
  {
    name: 'Open Calgary — Community Crime Statistics',
    url: 'https://data.calgary.ca/Health-and-Safety/Community-Crime-Statistics/78gh-n26t',
  },
] as const;

export const GUIDE_COMPARISON = [
  {
    need: 'What neighbours and public sources recently reported',
    source: 'Calgary Watch live map',
    action: '/map',
    actionLabel: 'Open the live map',
  },
  {
    need: 'Official reported-crime statistics and longer-term patterns',
    source: 'Calgary Police Service and Open Calgary data',
    action: GUIDE_SOURCES[2].url,
    actionLabel: 'View official community statistics',
  },
  {
    need: 'A crime in progress or immediate danger',
    source: 'Emergency services',
    action: 'tel:911',
    actionLabel: 'Call 911',
  },
  {
    need: 'A police matter that is not in progress',
    source: 'Calgary Police non-emergency',
    action: 'tel:4032661234',
    actionLabel: 'Call 403-266-1234',
  },
] as const;

export const GUIDE_FAQS = [
  {
    question: 'Is Calgary Watch an official Calgary Police crime map?',
    answer:
      'No. Calgary Watch is an independent community-awareness platform. Community reports are observations submitted by users, while public-source items show their attribution. For official reported-crime statistics, use Calgary Police Service or Open Calgary data.',
  },
  {
    question: 'Can I see current police activity near me?',
    answer:
      'Calgary Watch can show recent community reports and selected public-source incidents near a location. It does not show officer locations, dispatch calls, or a complete real-time record of police activity. Check each marker’s time and source before relying on it.',
  },
  {
    question: 'Is Calgary Watch the same as Block Watch Calgary?',
    answer:
      'No. Block Watch generally refers to neighbours organizing locally to prevent and report crime. Calgary Watch is a public incident map and reporting tool; it is not a Block Watch chapter or a Calgary Police Service program. The two ideas can complement each other, but they are not interchangeable.',
  },
  {
    question: 'Do I need an account to view the Calgary crime map?',
    answer:
      'No. Anyone can browse the public Calgary Watch map for free. An account is required only when submitting a community report.',
  },
  {
    question: 'Should I post on Calgary Watch before calling police?',
    answer:
      'No. Call 911 first for an emergency or crime in progress. For a police matter that is not in progress, call Calgary Police non-emergency at 403-266-1234 or use an eligible official online-reporting service. A Calgary Watch post can inform neighbours, but it does not create a police report.',
  },
] as const;
