export const COMMUNITY_PATH = '/community';

/**
 * Plain answers to what people search before landing here ("sirens near me", "live police
 * map", "calgary crime map"). Shown on /community and emitted as FAQPage JSON-LD, so the
 * visible text and the schema always match.
 */
export const COMMUNITY_FAQS = [
  {
    question: 'Is there a live crime map for Calgary?',
    answer: 'Yes. The CalgaryWatch map shows crime and safety reports from Calgary neighbours alongside Calgary Police news releases, City of Calgary 311 and traffic data, weather and emergency alerts, and power outages. Every pin shows its source and when it was posted. It is free.',
  },
  {
    question: 'Why are there sirens or police near me right now?',
    answer: 'Open the map and look near you. If a neighbour has posted what they saw, or Calgary Police or the City have published something, it will be pinned there. Not every police call is public, so an empty map does not mean nothing is happening. If you are in danger, call 911.',
  },
  {
    question: 'Is this a live police map or police tracker?',
    answer: 'No. CalgaryWatch does not show police dispatch calls or where officers are. It shows Calgary Police newsroom releases and reports from residents. For an emergency call 911; for police matters that are not in progress call 403-266-1234.',
  },
  {
    question: 'Why is there a helicopter circling near me?',
    answer: 'Helicopter activity is often not announced. Check the map for nearby reports from neighbours or official sources, and check back later, since a Calgary Police news release may follow.',
  },
  {
    question: 'How is this different from Block Watch or a neighbourhood watch group?',
    answer: 'Block Watch and neighbourhood watch groups organize people on a street. CalgaryWatch is a city-wide map: it puts neighbour reports and official sources in one place, so your group can see what is happening around it. Use them together, along with your Facebook group or Nextdoor.',
  },
  {
    question: 'Can I trust the reports?',
    answer: 'Neighbour reports are not checked by police. Each one shows who posted it and when, neighbours can mark it "I saw this too" or "Seems resolved", two flags from different people hide it, and it comes off the map after 5 days.',
  },
  {
    question: 'Does CalgaryWatch cover Airdrie?',
    answer: 'CalgaryWatch is built for Calgary. Residents can post reports in Airdrie, and some weather, road and emergency alerts reach it, but Airdrie is policed by Airdrie RCMP. Our Airdrie crime map guide lists what you will and won’t find.',
  },
];
