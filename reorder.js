const fs = require('fs');

let content = fs.readFileSync('src/pages/AdminPage.tsx', 'utf-8');

// Find Incidents (Editable) card
const incidentsCardRegex = /(<Card className="p-5 bg-slate-900\/80 border-white\/10 rounded-\[1\.6rem\] overflow-x-auto">\s*<div className="flex items-center justify-between mb-4">\s*<h2 className="text-lg font-bold">Incidents \(Editable\)<\/h2>[\s\S]*?<\/Card>)/;

const match = content.match(incidentsCardRegex);
if (match) {
  const cardText = match[1];
  
  // Remove the card from its current position
  content = content.replace(cardText, '');

  // Find where to insert it: right before Analytics
  const analyticsStartRegex = /\{\/\* ── Analytics ─────────────────────────────────────────────────────── \*\/\}/;
  
  content = content.replace(analyticsStartRegex, cardText + '\n\n        {/* ── Analytics ─────────────────────────────────────────────────────── */}');
  
  fs.writeFileSync('src/pages/AdminPage.tsx', content);
  console.log("Successfully reordered!");
} else {
  console.log("Could not find Incidents card.");
}
