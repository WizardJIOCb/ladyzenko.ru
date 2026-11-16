// Keep Tilda record IDs intact: its galleries and scripts depend on them.
export const siteAnchors: Record<string, { id: string; target: string; aliases: string[] }[]> = {
  '/': [
    { id:'top', target:'rec967078721', aliases:['rec967078721'] },
    { id:'about', target:'rec967078776', aliases:['rec967078776'] },
    { id:'news', target:'rec1161379451', aliases:['rec1161379451'] },
    { id:'photos', target:'rec967078786', aliases:['rec967078786'] },
    { id:'certificates', target:'rec967078801', aliases:['rec967078801'] },
    { id:'school', target:'rec1150244521', aliases:['rec1150244521'] },
    { id:'services', target:'rec1161429401', aliases:['rec1161429401','konsultacii'] },
    { id:'questions', target:'rec1003224706', aliases:['rec1003224706'] },
    { id:'buy', target:'rec1043768191', aliases:['rec1043768191'] },
    { id:'previews', target:'rec1043799761', aliases:['rec1043799761'] },
    { id:'articles', target:'rec4078656801', aliases:['rec4078656801','rec967078866'] },
    { id:'video', target:'rec967078816', aliases:['rec967078816'] },
    { id:'audiobook', target:'rec967078891', aliases:['rec967078891'] },
    { id:'contacts', target:'rec967078901', aliases:['rec967078901'] },
  ],
  '/new': [
    { id:'top', target:'rec938326901', aliases:['vverh'] },
    { id:'services', target:'rec927982016', aliases:['uslugi'] },
    { id:'lectures', target:'rec927985041', aliases:['lekcii'] },
    { id:'audiobook', target:'rec928006641', aliases:['mama-taim'] },
    { id:'contacts', target:'rec937877326', aliases:['kontakt'] },
  ],
};
