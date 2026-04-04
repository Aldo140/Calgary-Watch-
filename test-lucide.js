import * as icons from 'lucide-react';
['Search', 'Layers', 'Maximize2', 'ShieldCheck', 'AlertCircle', 'Car', 'Construction', 'CloudRain', 'UserCircle2', 'Siren', 'ShieldAlert', 'ShieldQuestion'].forEach(name => {
  if (!icons[name]) console.log(name, "IS MISSING");
});
