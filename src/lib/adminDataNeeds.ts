/** Hidden admin sections must not open unrelated Firestore listeners or polling. */
export function adminDataNeeds(section: string) {
  const all = section === 'all';
  const has = (...sections: string[]) => all || sections.includes(section);
  return { incidents: has('desk','reports','people'), stats: has('desk','city'), users: has('desk','people','members'),
    subscribers: has('planner'), visits: has('desk','visitors'), flagged: has('desk','reports'), health: has('desk','feeds') };
}
