/**
 * Calgary safety topics (/safety/:slug): one page per kind of crime people
 * search for ("Calgary car theft", "Calgary shooting"), each with recent local
 * news headlines that link out, who to call, and what neighbours can do.
 *
 * Copy rules: awareness, not alarm. Say what happened in plain words, never
 * rank or score a community, never guess at numbers we don't have. Every
 * phone number and online-reporting option here is from the official page in
 * SAFETY_CONTACTS; check those before changing one.
 *
 * `patterns` decide which headlines a topic shows. They are matched against a
 * story's headline and the feed's short summary (the summary is never shown).
 */

export interface SafetyFaq { question: string; answer: string }

export interface SafetyTopic {
  slug: string;
  /** Short name, sentence case: "Car theft". */
  label: string;
  /** For sentences: "car thefts". */
  noun: string;
  seoTitle: string;
  seoDescription: string;
  lead: string;
  /** What to do, in order. Plain sentences. */
  steps: string[];
  /** One CPS online-reporting category this topic can use, if any. */
  online?: string;
  /** Things neighbours report to the City through 311 that sit close to this topic. */
  cityReports?: string;
  faqs: SafetyFaq[];
  /** Words people search with. Folded and matched whole-word by safetyForQuery. */
  keywords: string[];
  patterns: RegExp[];
  /** A headline that also matches one of these topics isn't listed here (theft vs. car theft). */
  notWith?: string[];
}

export const SAFETY_PATH = '/safety';
export const SAFETY_UPDATED = '2026-10-21';

export const SAFETY_CONTACTS = {
  emergency: { label: 'Call 911', tel: '911', note: 'Danger now, or a crime happening now' },
  nonEmergency: { label: '403-266-1234', tel: '4032661234', note: 'Calgary Police non-emergency' },
  crimeStoppers: { label: '1-800-222-8477', tel: '18002228477', note: 'Calgary Crime Stoppers, anonymous tips', url: 'https://calgarycrimestoppers.org/' },
  antiFraud: { label: '1-888-495-8501', tel: '18884958501', note: 'Canadian Anti-Fraud Centre', url: 'https://antifraudcentre-centreantifraude.ca/' },
  reportOnline: { label: 'Report online', url: 'https://www.calgary.ca/cps/report-a-crime.html', note: 'Calgary Police online reporting, for eligible reports with no suspect' },
  nonEmergencyPage: { label: 'City of Calgary non-emergency contacts', url: 'https://www.calgary.ca/safety-contacts/non-emergency.html' },
  cpsNews: { label: 'Calgary Police news releases', url: 'https://newsroom.calgary.ca/police-news-releases/' },
  crimeStats: { label: 'Open Calgary community crime statistics', url: 'https://data.calgary.ca/Health-and-Safety/Community-Crime-Statistics/78gh-n26t' },
} as const;

const report = (what: string) => `If it's happening now or anyone is in danger, call 911. If it's already over, call Calgary Police non-emergency at 403-266-1234${what}.`;

export const SAFETY_TOPICS: SafetyTopic[] = [
  {
    slug: 'break-ins',
    label: 'Break-ins',
    noun: 'break-ins',
    seoTitle: 'Calgary Break-Ins: Recent News & How to Report | CalgaryWatch',
    seoDescription: 'Recent Calgary break-in and break-and-enter news from local newsrooms and Calgary Police, who to call, and simple steps neighbours take to look out for each other.',
    lead: 'Recent break-and-enter news from Calgary newsrooms and Calgary Police, with what to do if it happens to you or someone on your street.',
    steps: [
      'If you come home and think someone may still be inside, leave and call 911 from somewhere safe.',
      'Don’t touch or tidy anything until police have been. Take photos of the damage once it’s safe.',
      'If no one is in danger and it’s over, call 403-266-1234. A break-in at a business, garage or shed with no suspect can often be reported online.',
      'Write down serial numbers and keep photos of valuables, so stolen items can be identified.',
      'Tell your neighbours. A street that talks notices strangers trying doors.',
    ],
    online: 'Non-residential break and enter',
    cityReports: 'Neighbours also report unsecured or vacant buildings to the City through 311.',
    faqs: [
      { question: 'How do I report a break-in in Calgary?', answer: report('. Some break-ins at businesses, garages or sheds with no suspect can be reported online through Calgary Police') },
      { question: 'Where can I see break-ins near me?', answer: 'The CalgaryWatch live map shows recent reports from neighbours and Calgary Police news releases that name a community. For official yearly counts, use Open Calgary’s community crime statistics.' },
    ],
    keywords: ['break in', 'break ins', 'break and enter', 'b and e', 'burglary', 'burglaries', 'home invasion'],
    patterns: [/\bbreak[- ]?ins?\b/i, /\bbreak(?:ing)?[- ]and[- ]enter(?:ing|s)?\b/i, /\bB&E\b/, /\bburglar(?:y|ies|s)?\b/i, /\bbroke into\b/i, /\bhome invasions?\b/i],
  },
  {
    slug: 'car-theft',
    label: 'Car theft',
    noun: 'car thefts',
    seoTitle: 'Calgary Car Theft: Recent News, Prevention & Reporting | CalgaryWatch',
    seoDescription: 'Recent Calgary vehicle theft, car break-in and catalytic converter theft news from local newsrooms and Calgary Police, plus what to do if your car is stolen.',
    lead: 'Recent news on stolen vehicles, car break-ins and catalytic converter thefts in Calgary, and what to do if it happens to your car.',
    steps: [
      'If you see someone taking a vehicle right now, call 911. Don’t try to stop them yourself.',
      'If your car is gone, check it wasn’t towed, then call Calgary Police non-emergency at 403-266-1234 with your plate and VIN.',
      'Theft from a vehicle, or an attempted vehicle theft, with no suspect can be reported online through Calgary Police.',
      'Call your insurer once you have a police file number.',
      'Lock it, take the fob inside and keep it away from the front door, and leave nothing on the seats.',
    ],
    online: 'Theft from vehicle, or attempted vehicle theft',
    cityReports: 'Neighbours report vehicles abandoned on City streets through 311.',
    faqs: [
      { question: 'What do I do if my car is stolen in Calgary?', answer: 'Make sure it wasn’t towed, then call Calgary Police non-emergency at 403-266-1234 with your plate number and VIN. If you see it being taken, call 911. Then call your insurer with the police file number.' },
      { question: 'Can I report a car break-in online in Calgary?', answer: 'Yes, in many cases. Theft from a vehicle and attempted vehicle theft with no suspect are online-reporting categories with Calgary Police. If anyone is hurt or the person is still there, call 911.' },
    ],
    keywords: ['car theft', 'car thefts', 'stolen car', 'stolen cars', 'stolen vehicle', 'vehicle theft', 'auto theft', 'car break in', 'car break ins', 'catalytic converter', 'carjacking', 'stolen truck'],
    patterns: [
      /\b(?:stolen |theft of (?:an? )?|steal(?:s|ing)? (?:an? )?)(?:cars?|vehicles?|trucks?|SUVs?|pickups?|motorcycles?|trailers?)\b/i,
      /\b(?:cars?|vehicles?|trucks?|SUVs?)\b[^.]{0,20}\bstolen\b/i,
      /\b(?:auto|vehicle|car) thefts?\b/i,
      /\bcarjack(?:ing|ings|ed|er|ers)?\b/i,
      /\bcatalytic converters?\b/i,
      /\btheft from (?:a |an )?(?:vehicles?|cars?|trucks?)\b/i,
      /\b(?:car|vehicle) break[- ]?ins?\b/i,
    ],
  },
  {
    slug: 'shootings',
    label: 'Shootings',
    noun: 'shootings',
    seoTitle: 'Calgary Shootings: Recent News & Police Updates | CalgaryWatch',
    seoDescription: 'Recent reporting on shootings and gunfire in Calgary from local newsrooms and Calgary Police news releases, with how to share information with police safely.',
    lead: 'Recent reporting on shootings and gunfire in Calgary, from local newsrooms and Calgary Police. Headlines link to the original story.',
    steps: [
      'If you hear shots or see someone hurt, get to safety first, then call 911.',
      'Stay away from the scene and any police tape. Police may need to speak to people who were nearby.',
      'If you have dashcam or doorbell video from the area, police news releases usually say how to share it.',
      'To share what you know without giving your name, call Calgary Crime Stoppers at 1-800-222-8477.',
      'Before you share a post about it, check it came from police or a newsroom.',
    ],
    faqs: [
      { question: 'Who do I call if I hear gunshots in Calgary?', answer: 'Call 911. Give the location and what you heard or saw, and stay somewhere safe. To share information later without your name, call Calgary Crime Stoppers at 1-800-222-8477.' },
      { question: 'Where do Calgary police post updates about shootings?', answer: 'Calgary Police publish news releases on the City of Calgary newsroom. CalgaryWatch lists those releases alongside local news headlines, each linking to the original.' },
    ],
    keywords: ['shooting', 'shootings', 'shots fired', 'gunfire', 'gun violence', 'gunshot', 'gunshots', 'shot'],
    patterns: [/\bshootings?\b/i, /\bshots? (?:were )?fired\b/i, /\bgunfire\b/i, /\bgunshots?\b/i, /\bgun violence\b/i, /\b(?:was|were|been|fatally|man|woman|teen) shot\b/i, /\bfirearms? (?:charges|offences|seized|seizure)\b/i],
  },
  {
    slug: 'stabbings',
    label: 'Stabbings',
    noun: 'stabbings',
    seoTitle: 'Calgary Stabbings: Recent News & Police Updates | CalgaryWatch',
    seoDescription: 'Recent reporting on stabbings and knife attacks in Calgary from local newsrooms and Calgary Police, with who to call and how to help safely.',
    lead: 'Recent reporting on stabbings and knife attacks in Calgary, from local newsrooms and Calgary Police. Headlines link to the original story.',
    steps: [
      'If someone is hurt or in danger, call 911 and follow the call-taker’s instructions.',
      'Keep your distance from anyone with a weapon. Your safety comes first.',
      'Note what you can safely see: where, when, which way someone went.',
      'Share information anonymously with Calgary Crime Stoppers at 1-800-222-8477.',
    ],
    faqs: [
      { question: 'What should I do if I see a stabbing in Calgary?', answer: 'Get to a safe distance and call 911. If you can do it safely, tell the call-taker where it happened, how many people were involved and which way anyone left.' },
      { question: 'Where can I read about recent stabbings in Calgary?', answer: 'This page lists recent headlines from Calgary newsrooms and Calgary Police news releases, each linking to the original story.' },
    ],
    keywords: ['stabbing', 'stabbings', 'stabbed', 'knife attack', 'knife'],
    patterns: [/\bstabb(?:ing|ings|ed)\b/i, /\bknife(?:point)?\b/i, /\bedged weapon\b/i],
  },
  {
    slug: 'assaults',
    label: 'Assaults',
    noun: 'assaults',
    seoTitle: 'Calgary Assaults: Recent News, Support & Reporting | CalgaryWatch',
    seoDescription: 'Recent Calgary assault news from local newsrooms and Calgary Police news releases, how to report an assault, and where to find support.',
    lead: 'Recent reporting on assaults in Calgary from local newsrooms and Calgary Police, how to report one, and where to start if it happened to you.',
    steps: [
      'If you’re in danger or hurt, call 911.',
      'If it’s over and you’re safe, you can still report it: call Calgary Police non-emergency at 403-266-1234.',
      'Get medical care even if the injury seems small, and keep any messages, photos or clothing.',
      'If it happened to you, you don’t have to decide everything today. Calling 211 in Alberta connects you with local support services.',
    ],
    faqs: [
      { question: 'How do I report an assault in Calgary?', answer: report('') },
      { question: 'Where can I find support after an assault in Calgary?', answer: 'Call 211 in Alberta to be connected with local support services. In an emergency, call 911.' },
    ],
    keywords: ['assault', 'assaults', 'assaulted', 'attack', 'attacked', 'sexual assault', 'violent attack', 'random attack'],
    patterns: [/\bassault(?:s|ed|ing)?\b/i, /\b(?:violent|random|unprovoked|brutal) attacks?\b/i, /\baggravated\b/i],
  },
  {
    slug: 'robbery',
    label: 'Robbery',
    noun: 'robberies',
    seoTitle: 'Calgary Robbery News: Recent Robberies & Reporting | CalgaryWatch',
    seoDescription: 'Recent Calgary robbery news, including armed robberies and carjackings, from local newsrooms and Calgary Police, with what to do if you are robbed.',
    lead: 'Recent news on robberies in Calgary, from stores and banks to people on the street, with what to do if it happens to you.',
    steps: [
      'Give up what they ask for. Nothing you own is worth getting hurt.',
      'Call 911 as soon as you’re safe, even if the person has left.',
      'Remember what you can: height, clothing, direction, vehicle and plate.',
      'Cancel cards and phones that were taken, and note the police file number for your bank.',
    ],
    faqs: [
      { question: 'What do I do if I’m robbed in Calgary?', answer: 'Get to safety and call 911, even if the person has left. Robbery involves force or a threat, so it is reported by phone rather than online.' },
      { question: 'Is a robbery the same as a break-in?', answer: 'No. A robbery is theft using force or a threat against a person. A break-in is entering a building to commit a crime, usually when no one is there.' },
    ],
    keywords: ['robbery', 'robberies', 'robbed', 'armed robbery', 'mugging', 'mugged', 'hold up'],
    patterns: [/\brobber(?:y|ies)\b/i, /\brobbed\b/i, /\bhold[- ]?ups?\b/i, /\bmugg(?:ing|ed)\b/i, /\bswarm(?:ing|ed)\b/i, /\bcarjack(?:ing|ings|ed)\b/i],
  },
  {
    slug: 'homicide',
    label: 'Homicides',
    noun: 'homicides',
    seoTitle: 'Calgary Homicides: Recent News & Police Updates | CalgaryWatch',
    seoDescription: 'Recent reporting on homicide investigations in Calgary from local newsrooms and Calgary Police news releases, with how to share information with investigators.',
    lead: 'Recent reporting on homicide investigations in Calgary, from local newsrooms and Calgary Police. Each headline links to the original story.',
    steps: [
      'If you know something about an investigation, call Calgary Police non-emergency at 403-266-1234 and mention the case.',
      'To share information without giving your name, call Calgary Crime Stoppers at 1-800-222-8477.',
      'Families named in these stories are grieving. Please share news from the source, not rumours.',
    ],
    faqs: [
      { question: 'Where do Calgary police announce homicide investigations?', answer: 'Calgary Police publish news releases on the City of Calgary newsroom, and local newsrooms report on them. This page lists recent headlines from both, linking to the originals.' },
      { question: 'How can I give information about a homicide anonymously?', answer: 'Call Calgary Crime Stoppers at 1-800-222-8477 or submit a tip on their website. You don’t give your name.' },
    ],
    keywords: ['homicide', 'homicides', 'murder', 'murders', 'manslaughter', 'killed', 'killing'],
    patterns: [/\bhomicides?\b/i, /\bmurder(?:ed|s)?\b/i, /\bmanslaughter\b/i, /\b(?:first|second)[- ]degree\b/i, /\bsuspicious death\b/i],
  },
  {
    slug: 'fraud-scams',
    label: 'Fraud and scams',
    noun: 'scams',
    seoTitle: 'Calgary Scams & Fraud: Recent Warnings & How to Report | CalgaryWatch',
    seoDescription: 'Recent Calgary fraud and scam warnings from local newsrooms and Calgary Police, and where to report a scam, from phone and text scams to rental fraud.',
    lead: 'Recent scam and fraud warnings for Calgarians, and where to report one, whether it came by phone, text, email or a stranger at the door.',
    steps: [
      'Hang up, don’t click, don’t pay. Police, banks and the CRA don’t ask for gift cards or crypto.',
      'If you lost money, call your bank first, then Calgary Police non-emergency at 403-266-1234.',
      'Report the scam to the Canadian Anti-Fraud Centre at 1-888-495-8501, even if you didn’t lose anything.',
      'Talk to older relatives and neighbours. Scams spread by word of mouth, and so does the warning.',
    ],
    faqs: [
      { question: 'Where do I report a scam in Calgary?', answer: 'If you lost money, call your bank, then Calgary Police non-emergency at 403-266-1234. Report every scam, even an attempt, to the Canadian Anti-Fraud Centre at 1-888-495-8501.' },
      { question: 'What scams are going around Calgary?', answer: 'This page lists recent scam and fraud warnings from Calgary newsrooms and Calgary Police news releases, each linking to the original story.' },
    ],
    keywords: ['fraud', 'scam', 'scams', 'scammer', 'scammers', 'phishing', 'extortion', 'identity theft', 'rental scam'],
    patterns: [/\bfraud(?:ster|sters|ulent|ulently)?\b/i, /\bscam(?:s|mer|mers|med)?\b/i, /\bphishing\b/i, /\bextortion\b/i, /\bidentity theft\b/i, /\bcounterfeit\b/i],
  },
  {
    slug: 'drugs',
    label: 'Drugs',
    noun: 'drug cases',
    seoTitle: 'Calgary Drug News: Seizures, Charges & Drug Poisoning Alerts | CalgaryWatch',
    seoDescription: 'Recent Calgary drug news from local newsrooms and Calgary Police: drug seizures and charges, and drug poisoning warnings, with where to get help.',
    lead: 'Recent news on drug seizures, charges and drug-poisoning warnings in Calgary, and where to get help.',
    steps: [
      'If someone isn’t breathing or won’t wake up, call 911. Canada’s Good Samaritan Drug Overdose Act protects people who call for help.',
      'Free naloxone kits are available at many Alberta pharmacies, no prescription needed.',
      'Drug activity that isn’t an emergency can be reported to Calgary Police non-emergency at 403-266-1234, or anonymously to Crime Stoppers.',
      'Report discarded needles in a public place to the City through 311.',
    ],
    cityReports: 'Neighbours report discarded needles on public property to the City through 311.',
    faqs: [
      { question: 'How do I report drug activity in Calgary?', answer: 'Call Calgary Police non-emergency at 403-266-1234, or share it anonymously with Calgary Crime Stoppers at 1-800-222-8477. If someone is in danger, call 911.' },
      { question: 'What do I do if I find a needle in Calgary?', answer: 'Don’t pick it up with bare hands. Report a needle on public property to the City of Calgary through 311.' },
    ],
    keywords: ['drugs', 'drug', 'fentanyl', 'cocaine', 'meth', 'overdose', 'drug bust', 'drug trafficking', 'needles'],
    patterns: [/\bdrug (?:bust|busts|seizure|seizures|charges|trafficking|traffickers|lab|investigation|poisoning|poisonings)\b/i, /\bfentanyl\b/i, /\bcocaine\b/i, /\bmethamphetamine\b/i, /\bcarfentanil\b/i, /\boverdoses?\b/i],
  },
  {
    slug: 'impaired-driving',
    label: 'Impaired driving',
    noun: 'impaired driving cases',
    seoTitle: 'Calgary Impaired Driving: Recent News & Checkstops | CalgaryWatch',
    seoDescription: 'Recent Calgary impaired driving news and Checkstop updates from local newsrooms and Calgary Police, and what to do if you see an impaired driver.',
    lead: 'Recent news on impaired driving and Checkstops in Calgary, and what to do if you think the driver ahead of you is impaired.',
    steps: [
      'If you think a driver is impaired, pull over safely and call 911 with the plate, vehicle and direction.',
      'Don’t follow or try to stop them.',
      'Plan the ride home before the night starts: transit, a cab, or a sober driver.',
    ],
    faqs: [
      { question: 'Should I call 911 for a drunk driver in Calgary?', answer: 'Yes. An impaired driver is a danger right now, so call 911 once you’ve pulled over safely. Give the plate, the vehicle and which way it was going.' },
    ],
    keywords: ['impaired driving', 'impaired driver', 'drunk driving', 'drunk driver', 'dui', 'checkstop', 'checkstops'],
    patterns: [/\bimpaired\b/i, /\bdrunk[- ]driv(?:ing|er|ers)\b/i, /\bcheckstops?\b/i, /\bDUI\b/],
  },
  {
    slug: 'hit-and-run',
    label: 'Hit and runs',
    noun: 'hit and runs',
    seoTitle: 'Calgary Hit and Run News: Recent Cases & Reporting | CalgaryWatch',
    seoDescription: 'Recent Calgary hit-and-run news from local newsrooms and Calgary Police, with what to do if you are hit or see a driver leave the scene.',
    lead: 'Recent hit-and-run news from Calgary, and what to do if you’re hit, or you see a driver leave the scene.',
    steps: [
      'If anyone is hurt, call 911.',
      'Note the plate, make, colour and direction, and take photos if it’s safe.',
      'Ask witnesses for their names and numbers. Dashcam and doorbell video help.',
      'If no one is hurt, call Calgary Police non-emergency at 403-266-1234.',
    ],
    faqs: [
      { question: 'How do I report a hit and run in Calgary?', answer: 'If anyone is hurt, call 911. Otherwise call Calgary Police non-emergency at 403-266-1234 with the plate, vehicle description, time and place, and any witnesses.' },
    ],
    keywords: ['hit and run', 'hit and runs', 'fail to remain', 'pedestrian struck'],
    patterns: [/\bhit[- ]and[- ]runs?\b/i, /\bfail(?:ed|ing|ure)? to remain\b/i, /\bfled the scene\b/i],
  },
  {
    slug: 'vandalism',
    label: 'Vandalism and graffiti',
    noun: 'vandalism reports',
    seoTitle: 'Calgary Vandalism & Graffiti: Recent News & How to Report | CalgaryWatch',
    seoDescription: 'Recent Calgary vandalism, graffiti, mischief and arson news, and how to report damage to Calgary Police or graffiti on public property to the City through 311.',
    lead: 'Recent news on vandalism, graffiti and property damage in Calgary, and where each kind of report goes.',
    steps: [
      'Damage to your property with no suspect can be reported online through Calgary Police.',
      'Graffiti on public property, like a bus shelter or a City sign, goes to the City through 311.',
      'Photograph graffiti on your own property before you clean it, then remove it quickly. Fast removal discourages more.',
      'If someone is damaging property right now, call 911.',
    ],
    online: 'Property damage',
    cityReports: 'Graffiti on public property is one of the most common safety reports neighbours make to the City through 311.',
    faqs: [
      { question: 'How do I report graffiti in Calgary?', answer: 'Report graffiti on public property to the City of Calgary through 311. Damage to your own property can be reported to Calgary Police, online when there is no suspect.' },
      { question: 'Can I report vandalism online in Calgary?', answer: 'Yes, in many cases. Property damage with no suspect is an online-reporting category with Calgary Police. If it is happening now, call 911.' },
    ],
    keywords: ['vandalism', 'vandal', 'vandals', 'graffiti', 'mischief', 'property damage', 'arson'],
    patterns: [/\bvandal(?:s|ism|ized|ised)?\b/i, /\bgraffiti\b/i, /\bmischief\b/i, /\barson(?:ist|ists)?\b/i, /\bdeliberately set\b/i],
  },
  {
    slug: 'theft',
    label: 'Theft and shoplifting',
    noun: 'thefts',
    seoTitle: 'Calgary Theft & Shoplifting: Recent News & Reporting | CalgaryWatch',
    seoDescription: 'Recent Calgary theft news, from shoplifting and package theft to stolen bikes and tools, with which thefts you can report online to Calgary Police.',
    lead: 'Recent news on thefts in Calgary, from shoplifting and porch pirates to stolen bikes and tools, and how to report one.',
    steps: [
      'If the person is still there and anyone could get hurt, call 911. Don’t chase them.',
      'Retail shoplifting, theft of mail and construction site theft can be reported online through Calgary Police.',
      'For other thefts, call Calgary Police non-emergency at 403-266-1234.',
      'Register your bike’s serial number and keep receipts and photos of tools and electronics.',
    ],
    online: 'Retail shoplifting, theft of mail, or construction site theft',
    faqs: [
      { question: 'Can I report a theft online in Calgary?', answer: 'Some thefts, yes. Calgary Police take retail shoplifting, theft of mail, theft of a credit card and construction site theft online when there is no suspect. For other thefts call 403-266-1234.' },
    ],
    keywords: ['theft', 'thefts', 'stolen', 'shoplifting', 'shoplifter', 'package theft', 'porch pirate', 'stolen bike', 'bike theft', 'thieves'],
    patterns: [/\bshoplift(?:ing|er|ers|ed)?\b/i, /\bthefts?\b/i, /\bthie(?:f|ves)\b/i, /\bstolen\b/i, /\bstole\b/i, /\bporch pirates?\b/i],
    notWith: ['car-theft', 'break-ins', 'robbery', 'fraud-scams'],
  },
  {
    slug: 'missing-persons',
    label: 'Missing persons',
    noun: 'missing person cases',
    seoTitle: 'Calgary Missing Persons: Recent Police Appeals | CalgaryWatch',
    seoDescription: 'Recent Calgary missing person appeals from Calgary Police and local newsrooms, and what to do if someone you know is missing.',
    lead: 'Recent missing person appeals in Calgary. If you’ve seen someone named here, the original story says who to call.',
    steps: [
      'If you think someone is missing, call police right away. You don’t have to wait 24 hours.',
      'Call 911 if they may be in danger. Otherwise call Calgary Police non-emergency at 403-266-1234.',
      'Have a recent photo ready, and what they were wearing when last seen.',
      'Share official police appeals only, and share the update when someone is found.',
    ],
    faqs: [
      { question: 'Do I have to wait 24 hours to report someone missing in Calgary?', answer: 'No. Call police as soon as you’re worried. Call 911 if the person may be in danger, or Calgary Police non-emergency at 403-266-1234 otherwise.' },
    ],
    keywords: ['missing person', 'missing persons', 'missing', 'amber alert', 'missing teen', 'missing woman', 'missing man'],
    patterns: [/\bmissing (?:\d+-year-old|person|persons|man|woman|boy|girl|teen|teenager|senior|child|children|youth|mother|father)\b/i, /\bamber alert\b/i, /\breported missing\b/i, /\b(?:man|woman|boy|girl|teen|teenager|senior|child)\b[^.]{0,24}\bmissing\b/i, /\bhave you seen\b/i],
  },
];

export const SAFETY_FAQS: SafetyFaq[] = [
  { question: 'Is CalgaryWatch a police website?', answer: 'No. CalgaryWatch is an independent community-awareness site. Headlines here come from local newsrooms and Calgary Police news releases, and link to the original story.' },
  { question: 'Who do I call for a crime in Calgary that isn’t an emergency?', answer: 'Calgary Police non-emergency at 403-266-1234. Some reports with no suspect can be filed online through Calgary Police. Call 911 for danger or a crime happening now.' },
];
